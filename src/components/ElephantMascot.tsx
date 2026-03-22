import { motion } from "framer-motion";

interface ElephantMascotProps {
  /** px size (width = height) */
  size?: number;
  /** animate walk cycle */
  animated?: boolean;
  /** show pulsing glow behind */
  glow?: boolean;
  /** show shadow underneath */
  shadow?: boolean;
  /** extra className on wrapper */
  className?: string;
}

const LEG_DURATION = 1.2;

const leg1Anim = {
  rotate: [0, 10, 0, -10, 0],
  transition: { duration: LEG_DURATION, repeat: Infinity, ease: "easeInOut" as const },
};
const leg2Anim = {
  rotate: [0, -10, 0, 10, 0],
  transition: { duration: LEG_DURATION, repeat: Infinity, ease: "easeInOut" as const },
};
const bodyBob = {
  y: [0, -4, 0, -4, 0],
};
const shadowPulse = {
  scaleX: [1, 0.8, 1, 0.8, 1],
  opacity: [0.5, 0.2, 0.5, 0.2, 0.5],
};
const glowPulse = {
  scale: [0.8, 1.2, 0.8],
  opacity: [0.3, 0.6, 0.3],
};

const LEGS = [
  { src: "/elephant_leg2.png", origin: "53% 58%", z: "", anim: leg2Anim },
  { src: "/elephant_leg4.png", origin: "85% 58%", z: "", anim: leg2Anim },
  { src: "/elephant_leg1.png", origin: "41% 58%", z: "z-20", anim: leg1Anim },
  { src: "/elephant_leg3.png", origin: "68% 58%", z: "z-20", anim: leg1Anim },
] as const;

export default function ElephantMascot({
  size = 256,
  animated = true,
  glow = false,
  shadow = true,
  className = "",
}: ElephantMascotProps) {
  const imgClass = "absolute inset-0 w-full h-full object-contain";

  const Wrapper = animated ? motion.div : "div";
  const LegTag = animated ? motion.img : "img";

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {glow && (
        <motion.div
          className="absolute bg-primary/20 rounded-full blur-2xl"
          style={{ width: size * 0.75, height: size * 0.75 }}
          animate={glowPulse}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <Wrapper
        className="relative w-full h-full"
        {...(animated && {
          animate: bodyBob,
          transition: { duration: LEG_DURATION, repeat: Infinity, ease: "easeInOut" },
        })}
      >
        {LEGS.slice(0, 2).map((leg) => (
          <LegTag
            key={leg.src}
            src={leg.src}
            className={imgClass}
            style={{ transformOrigin: leg.origin }}
            {...(animated && { animate: leg.anim })}
          />
        ))}

        <img
          src="/elephant_body.png"
          className={`${imgClass} z-10 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]`}
          alt="Киберслон"
        />

        {LEGS.slice(2).map((leg) => (
          <LegTag
            key={leg.src}
            src={leg.src}
            className={`${imgClass} ${leg.z}`}
            style={{ transformOrigin: leg.origin }}
            {...(animated && { animate: leg.anim })}
          />
        ))}
      </Wrapper>

      {shadow && (
        <motion.div
          className="absolute bg-black/50 dark:bg-black/80 rounded-[100%] blur-sm"
          style={{ bottom: size * 0.06, width: size * 0.5, height: size * 0.045 }}
          animate={animated ? shadowPulse : undefined}
          transition={
            animated
              ? { duration: LEG_DURATION, repeat: Infinity, ease: "easeInOut" }
              : undefined
          }
        />
      )}
    </div>
  );
}
