import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ArrowRightIcon } from '@/features/landing/components/icons';
import {
  arrowNudge,
  contentColumn,
  focusRing,
  sectionHeading,
} from '@/features/landing/styles';
import { cn } from '@/lib/utils';

const QUESTIONS = [
  {
    id: 'bank',
    question: 'Does EverySub connect to my bank?',
    answer:
      'No. You add subscriptions yourself, or import a statement, receipt, or export and review what it finds. EverySub never asks for your bank login, and nothing is saved without your say-so.',
  },
  {
    id: 'cancel-subscription',
    question: 'Can EverySub cancel a subscription for me?',
    answer:
      'No. Cancelling happens with each provider. EverySub shows you what a subscription costs and when it renews, so you can decide in time, and the decision stays yours.',
  },
  {
    id: 'accuracy',
    question: 'How accurate are the upcoming charges?',
    answer:
      'They’re projected from each subscription’s price, billing cycle, and next renewal date, so they’re as accurate as those details. EverySub can’t see your payments, so it labels them as expected charges, never as confirmed ones.',
  },
  {
    id: 'uploads',
    question: 'What happens to the files I upload?',
    answer:
      'Smart import sends the files you choose to OpenAI to find recurring charges, and EverySub doesn’t store them. You review everything it finds before anything is saved. EverySub keeps a record of how much you use smart import, not what was in your files.',
  },
  {
    id: 'analytics',
    question: 'Does EverySub track how I use it?',
    answer:
      'Yes. EverySub uses Umami, a cookieless analytics tool hosted by EverySub, to see which pages and features people use. When you’re signed in, page visits and actions like adding a subscription are linked to your account ID. Analytics never includes your name, email, subscription names, prices, or anything you type.',
  },
  {
    id: 'refunds',
    question: 'Can I cancel my plan or get a refund?',
    answer:
      'You can cancel anytime, and Pro stays active until the end of the period you’ve paid for. For anything about refunds, email hello@everysub.app.',
  },
  {
    id: 'export',
    question: 'Can I take my data with me?',
    answer:
      'Yes. Export one collection or all of them as JSON or CSV whenever you like, and import them back into EverySub later.',
  },
  {
    id: 'mcp',
    question: 'When is the MCP server coming?',
    answer:
      'It’s in progress and will be part of Pro. Once it’s ready, you’ll be able to connect EverySub to Claude, ChatGPT, Cursor, or any other MCP client.',
  },
];

export function Faq() {
  return (
    <section
      id="faq"
      className={cn(
        'flex flex-col gap-8 pt-24 md:pt-38 lg:flex-row lg:justify-between lg:gap-12',
        contentColumn,
      )}
    >
      <div className="flex shrink-0 flex-col gap-5 lg:w-95">
        <h2 className={sectionHeading}>Questions, answered.</h2>
        <div className="flex max-w-82.5 flex-col gap-2.5">
          <p className="text-lg/7.25 text-ink-muted">
            Still curious? A real person
            <br />
            reads every email.
          </p>
          <a
            href="mailto:hello@everysub.app"
            className={cn(
              'group flex w-fit items-center gap-1.5 rounded-sm text-lg/6 font-medium text-brand underline decoration-brand/35 underline-offset-4',
              focusRing,
            )}
          >
            hello@everysub.app
            <ArrowRightIcon className={cn('size-4', arrowNudge)} />
          </a>
        </div>
      </div>
      {/* Side by side, it's pulled up so the first question's cap height
          lines up with the heading's. */}
      <Accordion
        defaultValue={['bank']}
        className="w-full lg:-mt-[17px] lg:w-160"
      >
        {QUESTIONS.map((item) => (
          <AccordionItem
            key={item.id}
            value={item.id}
            className="border-b border-line pb-2.5"
          >
            <AccordionTrigger
              className={cn(
                'items-center gap-6 rounded-sm border-0 pt-6.5 pb-4.25 text-[17px]/5.5 font-medium sm:text-lg/5.5 tracking-[-0.01em] text-ink transition-none hover:no-underline focus-visible:ring-0 data-panel-open:font-semibold **:data-[slot=accordion-trigger-icon]:text-ink-muted',
                focusRing,
              )}
            >
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="max-w-145 pb-3.5 text-base/6.5 text-ink-muted">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
