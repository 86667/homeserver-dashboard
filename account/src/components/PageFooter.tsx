import { BookOpen, Github, HelpCircle, Smartphone } from 'lucide-react';
import { PUBKY_RING_URL } from '@/lib/pubky-ring';

const LINKS = [
  { href: 'https://pubky.org/', label: 'What is Pubky?', Icon: HelpCircle },
  { href: PUBKY_RING_URL, label: 'Get Pubky Ring', Icon: Smartphone },
  { href: 'https://github.com/pubky/pubky-core/', label: 'GitHub', Icon: Github },
  { href: 'https://docs.pubky.org/', label: 'Documentation', Icon: BookOpen },
];

/** The page's footer, laid out like the admin dashboard's: name and version, copyright, links. */
export function PageFooter() {
  return (
    <footer className="mt-6 pt-4 pb-6 sm:pb-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 text-sm text-muted-foreground sm:px-6">
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row sm:gap-4">
          <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:gap-4 sm:text-left">
            <span className="text-xs sm:text-sm">Account page</span>
            <span className="text-xs" data-testid="page-version">
              v{__APP_VERSION__}
            </span>
          </div>
          <div className="flex flex-col items-center gap-2 text-center text-xs sm:flex-row sm:gap-4 sm:text-left">
            <span>Synonym Software, S.A. DE C.V. ©{new Date().getFullYear()}. All rights reserved.</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs sm:justify-end sm:gap-6">
          {LINKS.map(({ href, label, Icon }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
