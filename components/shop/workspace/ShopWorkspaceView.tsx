import { MasterTargetsBoard } from "@/components/shop/workspace/MasterTargetsBoard";
import { CreateShopTaskModal } from "@/components/shop/tasks/CreateShopTaskModal";
import { OngoingShopTasksBoard } from "@/components/shop/tasks/OngoingShopTasksBoard";
import { getOngoingShopTasks } from "@/lib/actions/shop-tasks";
import { getActiveMasterTargets } from "@/lib/actions/shop";

export async function ShopWorkspaceView() {
  const [targets, tasks] = await Promise.all([
    getActiveMasterTargets(),
    getOngoingShopTasks(),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col p-6 lg:p-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#1A1A1A]">
            Shop Workspace
          </h1>
          <p className="mt-1 text-sm text-[#6B6B6B]">
            Order lifecycle and inventory SLA for Indulge Shop
          </p>
        </div>
        <CreateShopTaskModal />
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="space-y-6">
            <OngoingShopTasksBoard tasks={tasks} />
          </div>
        </div>
        <div className="lg:col-span-1">
          <MasterTargetsBoard targets={targets} />
        </div>
      </div>
    </div>
  );
}
