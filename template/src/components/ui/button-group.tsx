import * as React from "react";
import { cn } from "../../lib/utils";

const ButtonGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="group"
    className={cn("nexus-button-group", className)}
    {...props}
  />
));

ButtonGroup.displayName = "ButtonGroup";

export { ButtonGroup };
