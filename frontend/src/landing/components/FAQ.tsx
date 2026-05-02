import { useState } from "react";
import { Plus } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import FadeInOnView from "./ui/FadeInOnView";
import SectionHeader from "./ui/SectionHeader";

interface QA {
  question: string;
  answer: string;
}

const QUESTIONS: QA[] = [
  {
    question: "Who is Eureka Hacks for?",
    answer:
      "Working product designers — from first-job IC to senior staff — who want a real, high-bar program without the bootcamp baggage. We turn down more applicants than we accept; it's not for hobbyists.",
  },
  {
    question: "Do I need a portfolio to apply?",
    answer:
      "Yes. Your application includes three case studies and a written brief. Don't worry about polish — we're reading for thinking, decisions, and self-awareness, not pixel perfection.",
  },
  {
    question: "How is the program structured week to week?",
    answer:
      "Each week ships a brief, a critique session, a 1:1 mentor call, and a deliverable. Plan for 12–15 hours per week in Foundations, 18–22 in Accelerator, and 25+ in Mastery. We are explicit about the time commitment because we are explicit about the outcomes.",
  },
  {
    question: "Is it remote, hybrid, or in-person?",
    answer:
      "Cohorts are remote-first, with optional in-person summits in NYC and SF for Accelerator and Mastery. Critique sessions are live; everything else is async-friendly across time zones.",
  },
  {
    question: "Are there scholarships or payment plans?",
    answer:
      "We reserve 10% of every cohort for need-based scholarships and have partnerships with three deferred-tuition providers. Accelerator and Mastery also support employer sponsorship — many alumni had their tuition covered.",
  },
  {
    question: "What happens after I graduate?",
    answer:
      "You join the alumni network: 8,000+ designers in a private Slack, monthly off-the-record sessions with industry leaders, and an in-house placement team that actively pushes openings to people whose work matches.",
  },
  {
    question: "Can I apply if I'm a self-taught designer?",
    answer:
      "Yes — about 35% of every cohort is self-taught. We care about the work and the reasoning, not the path. If anything, our admissions process is biased toward people who built their own way in.",
  },
  {
    question: "What if I get hired mid-cohort?",
    answer:
      "Congratulations. You finish the cohort. Many of our best outcomes happen in the first half of Accelerator, and the second half is what makes the offer not your last.",
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="relative bg-black py-24 md:py-32 lg:py-40">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <SectionHeader
              eyebrow="Common questions"
              title="Things to know before you apply."
              description="Still curious? Email hello@eurekahacks.local. A real human reads every message and replies within a day."
            />
          </div>

          <FadeInOnView className="lg:col-span-7" y={32}>
            <ul className="divide-y divide-white/10 border-y border-white/10">
              {QUESTIONS.map((qa, i) => {
                const isOpen = openIndex === i;
                return (
                  <li key={qa.question}>
                    <button
                      type="button"
                      onClick={() => setOpenIndex(isOpen ? null : i)}
                      aria-expanded={isOpen}
                      className="group flex w-full items-start justify-between gap-6 py-6 text-left transition-colors duration-200 hover:text-white"
                    >
                      <span className="text-base font-medium tracking-tight text-white md:text-lg">
                        {qa.question}
                      </span>
                      <motion.span
                        animate={{ rotate: isOpen ? 45 : 0 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/70 group-hover:border-white/30 group-hover:text-white"
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                      </motion.span>
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen ? (
                        <motion.div
                          key="content"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: "easeOut" }}
                          className="overflow-hidden"
                        >
                          <p className="pb-6 pr-12 text-sm leading-relaxed text-white/70 md:text-base">
                            {qa.answer}
                          </p>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ul>
          </FadeInOnView>
        </div>
      </div>
    </section>
  );
}
