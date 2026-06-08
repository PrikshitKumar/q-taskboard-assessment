import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getCurrentUser,
  unauthorized,
  forbidden,
  notFound,
  getProjectMembership,
  canEditTasks,
} from "@/lib/auth";
import { exportTasksToAirtable } from "@/lib/airtable";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) return notFound("project not found");

  const membership = await getProjectMembership(user.id, projectId);
  if (!membership) return forbidden("you are not a member of this project");
  if (!canEditTasks(membership.role)) return forbidden("viewers cannot trigger exports");

  const tasks = await prisma.task.findMany({
    where: { projectId },
    include: { assignee: { select: { name: true } } },
    orderBy: { position: "asc" },
  });

  try {
    const summary = await exportTasksToAirtable(
      tasks.map((t) => ({
        taskId:      t.id,
        projectId:   project.id,
        projectName: project.name,
        title:       t.title,
        status:      t.status,
        description: t.description,
        assignee:    t.assignee?.name ?? null,
        createdAt:   t.createdAt.toISOString(),
      }))
    );
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "export failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
