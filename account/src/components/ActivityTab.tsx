'use client';

import { Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Placeholder: what this tab will show once built. See the README's roadmap. */
export function ActivityTab() {
  return (
    <Card data-testid="activity-tab">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Activity className="size-5" />
          Activity
        </CardTitle>
        <CardDescription>What is happening on this homeserver, from its public event feed.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>
          Not built yet. This tab will show, day by day, the public files people add, change and remove here, who has
          been active recently, and which apps they use. Everything in it is already public on this homeserver.
        </p>
      </CardContent>
    </Card>
  );
}
