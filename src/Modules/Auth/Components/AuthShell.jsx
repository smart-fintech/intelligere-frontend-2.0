import { Card, CardContent } from '@/Components/ui/card'
import ThemeToggle from '@/Components/Layout/ThemeToggle'
import { cn } from '@/Library/utils'

/**
 * The frame every signed-out page sits in: the soft brand background, the
 * "Welcome to Intelligere" heading, the white card, and a line underneath
 * for the link across to the other page.
 *
 *   <AuthShell footer={<Button asChild variant="secondary">...</Button>}>
 *     <form>...</form>
 *   </AuthShell>
 *
 *   width    how wide the card may grow - `max-w-md` for a short form,
 *            `max-w-3xl` for the two-column registration form
 *   footer   what goes under the card
 *
 * Login, Register and Forgot password each wrote this out in full before;
 * now the three pages are only their forms.
 */
export default function AuthShell({ width = 'max-w-md', footer, children }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-brand-soft/60 px-4 py-5">
      {/* Light / dark switch, top-right - the same one the header has, so the
          choice made here carries on into the app after sign-in. */}
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4">
        <ThemeToggle />
      </div>

      <div className={cn('w-full space-y-4', width)}>
        <h1 className="text-center text-4xl font-light text-brand-light">
          Welcome to <span className="font-bold text-brand">Intelligere</span>
        </h1>

        <Card className="overflow-hidden border-border/70 py-0 shadow-lg shadow-brand/5">
          <CardContent className="px-6 py-7">{children}</CardContent>
        </Card>

        {footer ? (
          <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
