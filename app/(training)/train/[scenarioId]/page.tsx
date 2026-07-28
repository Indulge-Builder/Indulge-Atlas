import { notFound } from "next/navigation";
import { ScenarioPlayer } from "@/components/training/ScenarioPlayer";
import { getScenarioById } from "@/training/store/loadScenarios";

export default async function ScenarioPage({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  const { scenarioId } = await params;
  const scenario = getScenarioById(scenarioId);
  if (!scenario) notFound();

  return (
    <div className="mx-auto h-[calc(100vh-88px)] max-w-2xl">
      <ScenarioPlayer scenario={scenario} />
    </div>
  );
}
