'use client';

import { Server } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Placeholder: what this tab will show once built. See the README's roadmap. */
export function HomeserverTab() {
  return (
    <Card data-testid="homeserver-tab">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Server className="size-5" />
          Homeserver
        </CardTitle>
        <CardDescription>Facts about this homeserver.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>
          Not built yet. This tab will show the homeserver&apos;s public key and domain, the features it supports, and
          when its record on the Pubky network was last published.
        </p>
      </CardContent>
    </Card>
  );
}
