"use client";

import { useState, type ReactNode } from "react";

type TabItem = {
  id: string;
  label: string;
  content: ReactNode;
  hint?: string;
};

export function CustomerWorkspaceTabs({
  tabs,
  defaultTabId,
}: {
  tabs: TabItem[];
  defaultTabId?: string;
}) {
  const [activeTabId, setActiveTabId] = useState(defaultTabId ?? tabs[0]?.id);

  return (
    <div className="space-y-5">
      <div className="overflow-x-auto">
        <div className="inline-flex min-w-full gap-2 rounded-3xl border border-slate-200 bg-white p-2">
          {tabs.map((tab) => {
            const active = tab.id === activeTabId;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTabId(tab.id)}
                className={`min-w-[160px] rounded-2xl px-4 py-3 text-left transition ${
                  active
                    ? "bg-slate-950 text-white shadow-sm"
                    : "bg-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }`}
              >
                <p className="text-sm font-semibold">{tab.label}</p>
                {tab.hint ? (
                  <p className={`mt-1 text-xs ${active ? "text-slate-300" : "text-slate-400"}`}>
                    {tab.hint}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {tabs.map((tab) =>
        tab.id === activeTabId ? <div key={tab.id}>{tab.content}</div> : null,
      )}
    </div>
  );
}
