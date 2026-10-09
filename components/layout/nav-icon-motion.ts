import type { Variants } from "framer-motion";

// Tempo (Feedback 2026-10-09): alle Zeiten gut 15 % langsamer als ursprünglich, und die
// Animation startet erst nach kurzem Verweilen (NAV_HOVER_INTENT_MS in Sidebar.tsx),
// damit sie beim Überfahren der Liste nicht überall losgeht.

/** Shared easing for sidebar icon micro-interactions */
export const navIconEase = [0.4, 0, 0.2, 1] as const;

/** Parent variant – enables staggered child animations on nav row hover */
export const navItemVariants: Variants = {
  rest: {},
  hover: {},
};

/** One-shot: brief motion, then back to rest (no hold while hovered) */
export const oneShotTransition = {
  duration: 0.6,
  ease: [0.16, 1, 0.3, 1] as const,
  times: [0, 0.38, 1] as [number, number, number],
};

/** Subtle lift for standard lucide nav icons */
export const defaultNavIconVariants: Variants = {
  rest: {
    y: 0,
    scale: 1,
    transition: { duration: 0.23, ease: navIconEase },
  },
  hover: {
    y: [0, -2, 0],
    scale: [1, 1.05, 1],
    transition: oneShotTransition,
  },
};

/** Bell – damped left/right swing on hover */
export const bellRingVariants: Variants = {
  rest: {
    rotate: 0,
    transition: { rotate: { duration: 0 } },
  },
  hover: {
    rotate: [0, 18, -15, 12, -9, 6, -4, 2.5, -1.5, 0.5, 0],
    transition: {
      duration: 1.32,
      ease: [0.36, 0.07, 0.19, 0.97],
    },
  },
};

/** Insights line chart – wave ripples along the line (right → left) */
const insightsWaveTransition = {
  duration: 0.71,
  ease: "easeInOut" as const,
  times: [0, 0.32, 0.48, 1] as [number, number, number, number],
};

function insightsLineWaveVariants(peak: number, delay: number): Variants {
  return {
    rest: { y: 0, transition: { duration: 0.23, ease: navIconEase } },
    hover: {
      y: [0, peak, peak, 0],
      transition: { ...insightsWaveTransition, delay },
    },
  };
}

/** Right segment lifts first */
export const insightsLineSegment1Variants = insightsLineWaveVariants(-3, 0);
/** Middle dips – opposite phase for snake-like wave */
export const insightsLineSegment2Variants = insightsLineWaveVariants(2.5, 0.09);
/** Left segment follows upward */
export const insightsLineSegment3Variants = insightsLineWaveVariants(-2.5, 0.18);

/** WhatsApp bubble – subtle pulse on hover */
export const whatsappBubbleVariants: Variants = {
  rest: {
    scale: 1,
    transition: { scale: { duration: 0 } },
  },
  hover: {
    scale: [1, 1.08, 1],
    transition: {
      duration: 0.55,
      ease: [0.33, 1, 0.68, 1],
      times: [0, 0.38, 1],
    },
  },
};

/** WhatsApp typing dots – staggered bounce (left → right) */
const whatsappTypingTransition = {
  duration: 0.51,
  ease: [0.33, 1, 0.68, 1] as const,
  times: [0, 0.4, 1] as [number, number, number],
};

function whatsappTypingDotVariants(delay: number): Variants {
  return {
    rest: { y: 0, transition: { y: { duration: 0 } } },
    hover: {
      y: [0, -4.5, 0],
      transition: { ...whatsappTypingTransition, delay },
    },
  };
}

export const whatsappTypingDot1Variants = whatsappTypingDotVariants(0);
export const whatsappTypingDot2Variants = whatsappTypingDotVariants(0.13);
export const whatsappTypingDot3Variants = whatsappTypingDotVariants(0.26);

/** Members – front person lifts first, then the one behind (wave bounce) */
export const membersFrontVariants: Variants = {
  rest: { y: 0, transition: { y: { duration: 0 } } },
  hover: {
    y: [0, -3.5, 0],
    transition: oneShotTransition,
  },
};

export const membersBackVariants: Variants = {
  rest: { y: 0, transition: { y: { duration: 0 } } },
  hover: {
    y: [0, -2.5, 0],
    transition: {
      ...oneShotTransition,
      delay: 0.14,
    },
  },
};

/** Events – confetti wave flow (staggered, original icon elements only) */
const eventsWaveTransition = {
  duration: 0.71,
  ease: [0.33, 1, 0.68, 1] as const,
  times: [0, 0.2, 0.42, 0.68, 1] as [number, number, number, number, number],
};

function eventsConfettiWaveVariants(
  delay: number,
  xPeak: number,
  yPeak: number
): Variants {
  return {
    rest: { x: 0, y: 0, transition: { x: { duration: 0 }, y: { duration: 0 } } },
    hover: {
      x: [0, xPeak * 0.6, xPeak, xPeak * 0.4, 0],
      y: [0, yPeak * 0.5, yPeak, yPeak * 0.7, 0],
      transition: { ...eventsWaveTransition, delay },
    },
  };
}

/** Top-left dot */
export const eventsDotTopLeftVariants = eventsConfettiWaveVariants(0, -2.4, -4);
/** Top-center dot */
export const eventsDotTopVariants = eventsConfettiWaveVariants(0.05, 0.6, -4.5);
/** Right dot */
export const eventsDotRightVariants = eventsConfettiWaveVariants(0.1, 3.2, -3.4);
/** Bottom-right dot */
export const eventsDotBottomRightVariants = eventsConfettiWaveVariants(0.15, 2.8, 3.8);
/** Left streamer ribbon */
export const eventsStreamerVariants = eventsConfettiWaveVariants(0.04, -3.2, -2.8);
/** Center burst */
export const eventsBurstWaveVariants = eventsConfettiWaveVariants(0.08, 1.2, -2.6);

/** Übersicht – die vier Kacheln fliegen kurz nach außen (je in ihre Ecke) und zurück. */
function dashboardTileVariants(x: number, y: number, delay: number): Variants {
  return {
    rest: { x: 0, y: 0, transition: { duration: 0.23, ease: navIconEase } },
    hover: {
      x: [0, x, 0],
      y: [0, y, 0],
      transition: { ...oneShotTransition, delay },
    },
  };
}

export const dashboardTileTopLeftVariants = dashboardTileVariants(-1.8, -1.8, 0);
export const dashboardTileTopRightVariants = dashboardTileVariants(1.8, -1.8, 0.04);
export const dashboardTileBottomRightVariants = dashboardTileVariants(1.8, 1.8, 0.08);
export const dashboardTileBottomLeftVariants = dashboardTileVariants(-1.8, 1.8, 0.12);

const ICON_VARIANTS_BY_HREF: Record<string, Variants> = {
  "/news": bellRingVariants,
};

export function getNavIconVariants(href: string): Variants {
  return ICON_VARIANTS_BY_HREF[href] ?? defaultNavIconVariants;
}

export function getNavIconTransformOrigin(href: string): string {
  if (href === "/news") return "50% 12%";
  return "50% 50%";
}

