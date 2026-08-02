"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { Brand } from "@/components/brand";
import { NavLinks } from "@/components/nav-links";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function MobileNavigation({
  name,
  basePath = "",
}: {
  name: string;
  basePath?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <SheetHeader className="border-b px-5 py-5">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Brand name={name} />
        </SheetHeader>
        <div className="px-3">
          <NavLinks
            basePath={basePath}
            onNavigate={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
