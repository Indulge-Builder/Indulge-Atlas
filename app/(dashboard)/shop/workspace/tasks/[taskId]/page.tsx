import { notFound } from "next/navigation";
import { ShopTaskWarRoomClient } from "@/components/shop/tasks/ShopTaskWarRoomClient";
import { getTaskById } from "@/lib/actions/tasks";
import { requireShopWorkspaceAccess } from "@/lib/shop/requireShopWorkspaceAccess";

interface PageProps {
  params: Promise<{ taskId: string }>;
}

export default async function ShopTaskWarRoomPage({ params }: PageProps) {
  await requireShopWorkspaceAccess();
  const { taskId } = await params;

  const task = await getTaskById(taskId);
  if (!task) notFound();

  return <ShopTaskWarRoomClient initialTask={task} />;
}
