import { motion } from "framer-motion";
import { Brain, Zap, Trophy, HelpCircle, Star, Flame } from "lucide-react";

interface LoadingScreenProps {
  progress?: number;
  message?: string;
}

const FACES = [
  { Icon: Brain, rotate: "rotateY(0deg)" },
  { Icon: Zap, rotate: "rotateY(180deg)" },
  { Icon: Trophy, rotate: "rotateY(90deg)" },
  { Icon: HelpCircle, rotate: "rotateY(-90deg)" },
  { Icon: Star, rotate: "rotateX(90deg)" },
  { Icon: Flame, rotate: "rotateX(-90deg)" },
] as const;

const CUBE_SIZE = 100;
const HALF = CUBE_SIZE / 2;

const PARTICLES = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * 360;
  const radius = 80 + (i % 3) * 15;
  const duration = 3 + (i % 4) * 0.7;
  const delay = (i / 10) * -duration;
  const size = 3 + (i % 3);
  return { angle, radius, duration, delay, size };
});

export default function LoadingScreen({
  progress = 0,
  message = "Загрузка...",
}: LoadingScreenProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background overflow-hidden">
      <style>{`
        @keyframes cube-spin {
          0% { transform: rotateX(-20deg) rotateY(0deg); }
          100% { transform: rotateX(-20deg) rotateY(360deg); }
        }
        @keyframes orbit {
          0% { transform: rotate(var(--start-angle)) translateX(var(--radius)) rotate(calc(-1 * var(--start-angle))); opacity: 0.3; }
          50% { opacity: 1; }
          100% { transform: rotate(calc(var(--start-angle) + 360deg)) translateX(var(--radius)) rotate(calc(-1 * (var(--start-angle) + 360deg))); opacity: 0.3; }
        }
        @keyframes glow-pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 0.6; transform: scale(1.1); }
        }
        .cube-scene {
          perspective: 600px;
          width: ${CUBE_SIZE}px;
          height: ${CUBE_SIZE}px;
        }
        .cube {
          width: 100%;
          height: 100%;
          position: relative;
          transform-style: preserve-3d;
          animation: cube-spin 8s linear infinite;
          will-change: transform;
        }
        .cube-face {
          position: absolute;
          width: ${CUBE_SIZE}px;
          height: ${CUBE_SIZE}px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1.5px solid hsl(var(--primary) / 0.3);
          border-radius: 16px;
          background: hsl(var(--primary) / 0.08);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .cube-face svg {
          color: hsl(var(--primary));
          filter: drop-shadow(0 0 8px hsl(var(--primary) / 0.5));
        }
        .particle {
          position: absolute;
          border-radius: 50%;
          background: hsl(var(--primary));
          animation: orbit var(--duration) linear infinite;
          animation-delay: var(--delay);
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .cube { animation: none; transform: rotateX(-20deg) rotateY(-30deg); }
          .particle { animation: none; opacity: 0.5; }
        }
      `}</style>

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative flex items-center justify-center"
        style={{ width: 220, height: 220 }}
      >
        {/* Glow behind cube */}
        <div
          className="absolute rounded-full bg-primary/20 blur-[40px]"
          style={{
            width: 160,
            height: 160,
            animation: "glow-pulse 3s ease-in-out infinite",
          }}
        />

        {/* Orbiting particles */}
        {PARTICLES.map((p, i) => (
          <div
            key={i}
            className="particle"
            style={{
              width: p.size,
              height: p.size,
              left: "50%",
              top: "50%",
              marginLeft: -p.size / 2,
              marginTop: -p.size / 2,
              "--start-angle": `${p.angle}deg`,
              "--radius": `${p.radius}px`,
              "--duration": `${p.duration}s`,
              "--delay": `${p.delay}s`,
            } as React.CSSProperties}
          />
        ))}

        {/* 3D Cube */}
        <div className="cube-scene">
          <div className="cube">
            {FACES.map(({ Icon, rotate }, i) => (
              <div
                key={i}
                className="cube-face"
                style={{
                  transform: `${rotate} translateZ(${HALF}px)`,
                }}
              >
                <Icon size={36} strokeWidth={1.5} />
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="mt-8 flex w-64 flex-col items-center gap-4 relative z-20"
      >
        <div className="text-sm font-medium uppercase tracking-[0.2em] text-primary">
          {message}
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary border border-border">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          />
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          {Math.round(progress)}%
        </div>
      </motion.div>
    </div>
  );
}
