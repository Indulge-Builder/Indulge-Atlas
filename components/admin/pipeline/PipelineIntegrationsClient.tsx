"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { PipelineDynamicMapper } from "./PipelineDynamicMapper";
import type { PipelineChannel } from "./pipeline-data";
import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataMapperNode } from "./DataMapperNode";
import { PIPELINE_MAPPINGS, PIPELINE_TAB_LABELS } from "./pipeline-data";

export function PipelineIntegrationsClient() {
  const [editOpen, setEditOpen] = useState(false);
  const [tab, setTab] = useState<PipelineChannel>("meta");

  return (
    <>
      <div className="mb-6 flex justify-end">
        <Button
          type="button"
          variant="outline"
          className="shrink-0 border-[#E5E4DF] bg-white text-[#1A1A1A] shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] hover:bg-[#FAFAF8]"
          onClick={() => setEditOpen(true)}
        >
          <Sparkles className="mr-2 h-4 w-4 text-[#D4AF37]" />
          Edit Schema
        </Button>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as PipelineChannel)}
        className="w-full"
      >
        <TabsList className="mb-2 h-auto w-full flex-wrap justify-start gap-1 bg-[#F2F2EE] p-1.5 sm:inline-flex">
          {(["meta", "google", "website"] as const).map((key) => (
            <TabsTrigger
              key={key}
              value={key}
              className="rounded-md px-4 py-2 data-[state=active]:shadow-sm"
            >
              {PIPELINE_TAB_LABELS[key].title}
            </TabsTrigger>
          ))}
        </TabsList>

        <PipelineDynamicMapper channel={tab} />

        {(["meta", "google", "website"] as const).map((channel) => (
          <TabsContent key={channel} value={channel} className="mt-6">
            <p className="mb-4 max-w-3xl text-sm leading-relaxed text-[#6B6B6B]">
              {PIPELINE_TAB_LABELS[channel].description}
            </p>
            <div
              className={cn(
                surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
                "p-4 md:p-6",
              )}
            >
              <div className="divide-y divide-[#EAEAEA]">
                {PIPELINE_MAPPINGS[channel].map((row, i) => (
                  <DataMapperNode key={`${row.sourceKey}-${i}`} mapping={row} />
                ))}
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle className="font-serif text-xl">Edit field mapping</SheetTitle>
            <SheetDescription>
              Mapping logic is currently enforced via core API routes for data
              integrity. Dynamic ETL editing will be unlocked in a future update.
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <div className="space-y-6">
              <div
                className={cn(
                  surfaceCardVariants({ tone: "subtle", elevation: "xs" }),
                  "p-4",
                )}
              >
                <p className="text-sm leading-relaxed text-[#6B6B6B]">
                  Preview-only controls show how you will remap webhook keys to{" "}
                  <code className="rounded bg-[#F2F2EE] px-1 font-mono text-xs">
                    leads
                  </code>{" "}
                  columns once dynamic configuration ships.
                </p>
              </div>

              <div className="space-y-2 opacity-60">
                <Label htmlFor="pipeline-src" className="text-[#1A1A1A]">
                  Source JSON key
                </Label>
                <Input
                  id="pipeline-src"
                  defaultValue="phone_number"
                  disabled
                  className="border-[#E5E4DF] bg-[#FAFAF8] font-mono text-sm"
                />
              </div>

              <div className="space-y-2 opacity-60">
                <Label htmlFor="pipeline-tgt" className="text-[#1A1A1A]">
                  Target column
                </Label>
                <Select disabled defaultValue="phone_number">
                  <SelectTrigger
                    id="pipeline-tgt"
                    className="border-[#E5E4DF] bg-[#FAFAF8]"
                  >
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="phone_number">phone_number</SelectItem>
                    <SelectItem value="form_data">form_data (JSONB)</SelectItem>
                    <SelectItem value="utm_campaign">utm_campaign</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 opacity-60">
                <Label htmlFor="pipeline-note" className="text-[#1A1A1A]">
                  Transformation note
                </Label>
                <Input
                  id="pipeline-note"
                  defaultValue="Trim & coerce to string"
                  disabled
                  className="border-[#E5E4DF] bg-[#FAFAF8]"
                />
              </div>
            </div>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
