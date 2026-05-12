import * as React from "react";
import { Input, type InputProps } from "./input";

export type DateInputProps = Omit<InputProps, "type">;

export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  function DateInput(props, ref) {
    return <Input ref={ref} type="date" {...props} />;
  },
);
