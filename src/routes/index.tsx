import { createFileRoute } from '@tanstack/react-router';

import { Benefits } from '@/features/landing/components/benefits';
import { CtaSection } from '@/features/landing/components/cta-section';
import { Faq } from '@/features/landing/components/faq';
import { Hero } from '@/features/landing/components/hero';
import { McpSection } from '@/features/landing/components/mcp-section';
import { Pricing } from '@/features/landing/components/pricing';
import { ServicesStrip } from '@/features/landing/components/services-strip';
import { SiteFooter } from '@/features/landing/components/site-footer';
import { SiteHeader } from '@/features/landing/components/site-header';
import { Testimonials } from '@/features/landing/components/testimonials';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      {
        name: 'description',
        content:
          'EverySub keeps every subscription’s cost, renewal date, and billing history in one place, so you know what you pay for before it renews.',
      },
    ],
  }),
  component: LandingPage,
});

/** The public marketing page. It's light-only, whatever the app theme. */
function LandingPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center bg-white text-ink scheme-light [--gutter:--spacing(5)] sm:[--gutter:--spacing(8)]">
      <SiteHeader />
      <main className="flex w-full flex-col items-center">
        <Hero />
        <ServicesStrip />
        <Benefits />
        <McpSection />
        <Pricing />
        <Testimonials />
        <Faq />
        <CtaSection />
      </main>
      <SiteFooter />
    </div>
  );
}
