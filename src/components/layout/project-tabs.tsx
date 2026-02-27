"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Package,
  Sparkles,
  ClipboardCheck,
  Languages,
  Settings,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectTabsProps {
  projectId: string;
}

export function ProjectTabs({ projectId }: ProjectTabsProps) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  const tabs = [
    { href: base, label: "Productos", icon: Package, exact: true },
    { href: `${base}/generate`, label: "Generar", icon: Sparkles },
    { href: `${base}/review`, label: "Revisar", icon: ClipboardCheck },
    { href: `${base}/translations`, label: "Traducciones", icon: Languages },
    { href: `${base}/export`, label: "Exportar", icon: Download },
    { href: `${base}/settings`, label: "Config", icon: Settings },
  ];

  return (
    <div className="flex gap-1 border-b border-border mb-6">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
