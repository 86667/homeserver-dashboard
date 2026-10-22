'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, Check, CircleCheckBig, Search } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonSpinner } from '@/components/ui/button-spinner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminService } from '@/services/admin/admin';
import type { UserQuotaResponse } from '@/services/admin/admin.types';
import { QUOTA_FIELDS, type QuotaText, defaultText, quotaPatch, quotaText } from '@/lib/quota-form';

export interface UserEditorProps {
  /** Opens a user from elsewhere (e.g. "Manage" on a used invite code); a new nonce reopens the same one. */
  request?: { pubkey: string; nonce: number } | null;
  onDisableUser: (pubkey: string) => Promise<void>;
  onEnableUser: (pubkey: string) => Promise<void>;
}

type Loaded = { pubkey: string; quota: UserQuotaResponse; text: QuotaText };
/** What is known about the account being enabled: from the homeserver when it says, else from this session's own actions. */
type AccessState = 'enabled' | 'disabled' | 'unknown';

type Busy = 'lookup' | 'save' | 'disable' | 'enable' | null;

const getService = () => new AdminService();
const message = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;
const statusOf = (error: unknown) =>
  typeof error === 'object' && error !== null && 'status' in error ? (error as { status?: number }).status : undefined;

/** A pubky as typed or pasted, without the `pubky` prefix or the pubky:// scheme. */
const bareKey = (input: string) =>
  input
    .trim()
    .replace(/^pubky:\/\//, '')
    .replace(/^pubky(?=.{52}$)/, '');

/**
 * Look up one user by pubky, change their allowance (storage, rates, bursts,
 * writable paths) and disable or enable them. Uses the admin
 * `GET|PATCH /users/{pubkey}/quota` of pubky-homeserver 0.16+.
 */
export function UserEditor({ request, onDisableUser, onEnableUser }: UserEditorProps) {
  const [input, setInput] = useState('');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [edited, setEdited] = useState<QuotaText | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [access, setAccess] = useState<AccessState>('unknown');
  const lookupId = useRef(0);
  // Whose status this session remembers; a different account starts from unknown.
  const rememberedFor = useRef<string | null>(null);

  const lookUp = useCallback(async (pubkey: string) => {
    const thisLookup = ++lookupId.current;
    setBusy('lookup');
    setError(null);
    setNotice(null);
    try {
      const quota = await getService().getUserQuota(pubkey);
      if (thisLookup !== lookupId.current) return;
      const text = quotaText(quota.overrides);
      setLoaded({ pubkey, quota, text });
      setEdited(text);
      // A fresh answer replaces what this session remembered, if the homeserver reports it.
      if (typeof quota.disabled === 'boolean') setAccess(quota.disabled ? 'disabled' : 'enabled');
      else if (rememberedFor.current !== pubkey) setAccess('unknown');
      rememberedFor.current = pubkey;
    } catch (err) {
      if (thisLookup !== lookupId.current) return;
      setLoaded(null);
      setError(
        statusOf(err) === 404
          ? 'This homeserver has no user with that pubky.'
          : statusOf(err) === 400
            ? 'That is not a valid pubky.'
            : message(err, 'Could not look up the user.'),
      );
    } finally {
      if (thisLookup === lookupId.current) setBusy(null);
    }
  }, []);

  useEffect(() => {
    if (!request) return;
    setInput(request.pubkey);
    void lookUp(request.pubkey);
  }, [request, lookUp]);

  // Clearing the search bar clears the account with it: nothing of someone
  // else's stays on screen once their key is gone.
  const handleInput = (value: string) => {
    setInput(value);
    if (value.trim() === '' && loaded) {
      lookupId.current += 1;
      setLoaded(null);
      setEdited(null);
      setAccess('unknown');
      setError(null);
      setNotice(null);
    }
  };

  const handleLookUp = () => {
    const pubkey = bareKey(input);
    if (!pubkey) {
      setError("Enter a user's pubky first.");
      return;
    }
    setInput(pubkey);
    void lookUp(pubkey);
  };

  const handleSave = async () => {
    if (!loaded || !edited) return;
    setError(null);
    setNotice(null);
    let patch;
    try {
      patch = quotaPatch(loaded.text, edited);
    } catch (err) {
      setError(message(err, 'Could not read the changes.'));
      return;
    }
    setBusy('save');
    try {
      await getService().patchUserQuota(loaded.pubkey, patch);
      await lookUp(loaded.pubkey);
      setNotice('Allowance saved.');
    } catch (err) {
      setError(message(err, 'Could not save the allowance.'));
      setBusy(null);
    }
  };

  const handleAccess = async (action: 'disable' | 'enable') => {
    if (!loaded) return;
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      await (action === 'disable' ? onDisableUser : onEnableUser)(loaded.pubkey);
      setAccess(action === 'disable' ? 'disabled' : 'enabled');
      setNotice(
        action === 'disable'
          ? 'User disabled. They can no longer sign in or write; their files are kept.'
          : 'User enabled. They can sign in again.',
      );
    } catch (err) {
      setError(message(err, `Could not ${action} the user.`));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Card data-testid="user-editor">
        <CardHeader className="pb-4">
          <CardTitle className="text-base sm:text-lg">Manage a user</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Look up an account by pubky to change its allowance, or to disable or enable it.
          </CardDescription>
        </CardHeader>

        <div className="mx-6 h-px bg-border/60" />

        <CardContent className="space-y-4 pt-4">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              handleLookUp();
            }}
          >
            <Input
              aria-label="User pubky"
              placeholder="pubky…"
              value={input}
              onChange={(event) => handleInput(event.target.value)}
              spellCheck={false}
              autoComplete="off"
              className="font-mono"
            />
            <Button type="submit" variant="outline" disabled={busy !== null} className="shrink-0 gap-2">
              {busy === 'lookup' ? <ButtonSpinner /> : <Search className="h-4 w-4" />}
              Look up
            </Button>
          </form>

          {error && (
            <Alert variant="destructive" data-testid="user-editor-error">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription className="text-xs break-words">{error}</AlertDescription>
            </Alert>
          )}

          {notice && (
            <Alert data-testid="user-editor-notice">
              <Check className="h-4 w-4" />
              <AlertTitle>Done</AlertTitle>
              <AlertDescription className="text-xs">{notice}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {loaded && (
        <Card data-testid="user-access">
          <CardHeader className="pb-4">
            <CardTitle className="text-base sm:text-lg">Account</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              <code className="font-mono break-all">pubky{loaded.pubkey}</code>
            </CardDescription>
          </CardHeader>

          <div className="mx-6 h-px bg-border/60" />

          <CardContent className="space-y-3 pt-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <span className="shrink-0 text-xs text-muted-foreground sm:text-sm">Status:</span>
              <AccessBadge access={access} />
            </div>
            {access === 'unknown' && (
              <p className="text-xs text-muted-foreground/70" data-testid="user-access-unknown">
                This homeserver does not report whether an account is disabled. After you disable or enable it here, the
                status shows what you did.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {access !== 'enabled' && (
                <Button
                  variant="outline"
                  onClick={() => void handleAccess('enable')}
                  disabled={busy !== null}
                  size="sm"
                  data-testid="user-enable"
                >
                  {busy === 'enable' && <ButtonSpinner />}
                  Enable
                </Button>
              )}
              {access !== 'disabled' && (
                <Button
                  variant="destructive"
                  onClick={() => void handleAccess('disable')}
                  disabled={busy !== null}
                  size="sm"
                  data-testid="user-disable"
                >
                  {busy === 'disable' && <ButtonSpinner />}
                  Disable
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground/70">
              A disabled account cannot sign in or write; its files are kept and stay readable.
            </p>
          </CardContent>
        </Card>
      )}

      {loaded && edited && (
        <Card data-testid="user-editor-result">
          <CardHeader className="pb-4">
            <CardTitle className="text-base sm:text-lg">Allowance</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Empty fields follow the homeserver&apos;s defaults, shown greyed out. Clear a field to hand it back to the
              default.
            </CardDescription>
          </CardHeader>

          <div className="mx-6 h-px bg-border/60" />

          <CardContent className="space-y-4 pt-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {QUOTA_FIELDS.map(({ key, label, hint }) => {
                const overridden = key in loaded.quota.overrides;
                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`quota-${key}`}>{label}</Label>
                      <Badge variant={overridden ? 'secondary' : 'outline'} className="text-[10px] font-normal">
                        {overridden ? 'custom' : 'default'}
                      </Badge>
                    </div>
                    <Input
                      id={`quota-${key}`}
                      value={edited[key]}
                      onChange={(event) => setEdited({ ...edited, [key]: event.target.value })}
                      placeholder={defaultText(key, loaded.quota.effective)}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <p className="text-xs text-muted-foreground/70">{hint}</p>
                  </div>
                );
              })}
            </div>

            <Button onClick={() => void handleSave()} disabled={busy !== null} size="sm">
              {busy === 'save' && <ButtonSpinner />}
              Save allowance
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function AccessBadge({ access }: { access: AccessState }) {
  if (access === 'enabled') {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand sm:text-sm"
        data-testid="user-access-enabled"
      >
        <CircleCheckBig className="h-4 w-4" />
        Enabled
      </span>
    );
  }
  if (access === 'disabled') {
    return (
      <Badge variant="destructive" className="text-xs" data-testid="user-access-disabled">
        <Ban className="mr-1 h-3 w-3" />
        Disabled
      </Badge>
    );
  }
  return (
    <span className="text-xs text-muted-foreground sm:text-sm" data-testid="user-access-not-known">
      Not known
    </span>
  );
}
