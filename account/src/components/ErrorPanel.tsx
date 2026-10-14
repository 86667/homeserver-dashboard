'use client';

import { RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface ErrorPanelProps {
  title: string;
  message: string;
  onRetry: () => void;
  testId: string;
}

/** What went wrong, and a way to try again. */
export function ErrorPanel({ title, message, onRetry, testId }: ErrorPanelProps) {
  return (
    <div className="space-y-4">
      <Alert variant="destructive" data-testid={testId}>
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="text-xs break-words">{message}</AlertDescription>
      </Alert>
      <Button onClick={onRetry} className="w-full gap-2">
        <RefreshCw className="size-4" />
        Try again
      </Button>
    </div>
  );
}
