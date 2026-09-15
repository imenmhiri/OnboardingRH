'use client';

import * as LabelPrimitive from '@radix-ui/react-label';
import { AlertCircle } from 'lucide-react';
import { createContext, useContext, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface FieldContextValue {
  readonly controlId: string;
  readonly describedBy: string | undefined;
  readonly invalid: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

function useField(): FieldContextValue {
  const context = useContext(FieldContext);
  if (!context) {
    throw new Error('Un contrôle de formulaire doit être placé dans <Field>.');
  }
  return context;
}

export interface FieldProps {
  readonly label: string;
  readonly description?: string;
  /** Message d'erreur ; sa présence rend le contrôle invalide. */
  readonly error?: string;
  readonly required?: boolean;
  readonly children: ReactNode;
}

/**
 * Binds a label, a description and an error to one control. Doing this by hand
 * on every screen is how a form ends up with a control nobody can name.
 */
export function Field({ label, description, error, required = false, children }: FieldProps) {
  const controlId = useId();
  const descriptionId = `${controlId}-description`;
  const errorId = `${controlId}-error`;
  const describedBy = [description ? descriptionId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <FieldContext.Provider
      value={{ controlId, describedBy: describedBy || undefined, invalid: Boolean(error) }}
    >
      <div className="space-y-1.5">
        <LabelPrimitive.Root htmlFor={controlId} className="block text-sm font-medium text-text">
          {label}
          {required ? (
            <span className="ml-1 text-danger" aria-hidden>
              *
            </span>
          ) : null}
          {required ? <span className="sr-only"> (obligatoire)</span> : null}
        </LabelPrimitive.Root>
        {description ? (
          <p id={descriptionId} className="text-sm text-text-muted">
            {description}
          </p>
        ) : null}
        {children}
        {error ? (
          // role="alert" pour que l'erreur soit annoncée, et non seulement colorée.
          <p id={errorId} role="alert" className="flex items-center gap-1.5 text-sm text-danger">
            <AlertCircle aria-hidden className="size-4 shrink-0" />
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const { controlId, describedBy, invalid } = useField();
  return (
    <input
      id={controlId}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className={cn(
        'h-10 w-full rounded-[var(--radius)] border bg-surface-raised px-3 text-sm text-text',
        'placeholder:text-text-subtle',
        invalid ? 'border-danger' : 'border-border hover:border-border-strong',
        className,
      )}
      {...props}
    />
  );
}
