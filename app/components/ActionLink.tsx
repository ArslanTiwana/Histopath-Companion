"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useActions } from "@/app/components/ActionProvider";

type ActionLinkProps = ComponentProps<typeof Link> & {
  "data-action"?: string;
};

export default function ActionLink({
  onClick,
  href,
  "data-action": dataAction,
  ...props
}: ActionLinkProps) {
  const actions = useActions();
  return (
    <Link
      {...props}
      href={href}
      data-action={dataAction || "navigate"}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          event.preventDefault();
          void actions.run("navigate", { to: String(href) });
        }
      }}
    />
  );
}
