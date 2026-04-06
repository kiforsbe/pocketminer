import { ITEM_DEFINITIONS } from "./inventory.js";

const PARTICLE_GRAVITY = 820;

export function createParticleSystem({ getParticles, setParticles, getPlayer }) {
  function spawnParticle(particle) {
    getParticles().push(particle);
  }

  return {
    spawnOreChunks(miningResult) {
      const palette = ITEM_DEFINITIONS[miningResult.resource];
      if (!palette) {
        return;
      }

      const player = getPlayer();
      const originX = miningResult.column * 32 + 16;
      const originY = miningResult.row * 32 + 16;
      const direction = player.getCenter().x <= originX ? 1 : -1;
      const count = 7 + Math.floor(Math.random() * 3);

      for (let index = 0; index < count; index += 1) {
        const life = 0.55 + Math.random() * 0.3;
        spawnParticle({
          x: originX + (Math.random() - 0.5) * 10,
          y: originY + (Math.random() - 0.5) * 8,
          vx: direction * (120 + Math.random() * 90) + (Math.random() - 0.5) * 45,
          vy: -(110 + Math.random() * 120),
          size: 6 + Math.random() * 5,
          color: palette.color,
          glow: palette.glow,
          rotation: Math.random() * Math.PI * 2,
          angularVelocity: (Math.random() - 0.5) * 9,
          life,
          maxLife: life,
        });
      }
    },

    spawnExplosionBurst({ x, y }) {
      const count = 18;
      for (let index = 0; index < count; index += 1) {
        const angle = (Math.PI * 2 * index) / count + (Math.random() - 0.5) * 0.2;
        const speed = 100 + Math.random() * 180;
        const life = 0.34 + Math.random() * 0.26;
        spawnParticle({
          x: x + (Math.random() - 0.5) * 8,
          y: y + (Math.random() - 0.5) * 8,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 40,
          size: 7 + Math.random() * 7,
          color: index % 3 === 0 ? "#ffdf8b" : index % 2 === 0 ? "#ff8a52" : "#4a444c",
          glow: index % 3 === 0 ? "rgba(255, 223, 139, 0.44)" : "rgba(255, 133, 82, 0.34)",
          rotation: Math.random() * Math.PI * 2,
          angularVelocity: (Math.random() - 0.5) * 12,
          life,
          maxLife: life,
        });
      }
    },

    update(dt) {
      setParticles(
        getParticles()
          .map((particle) => ({
            ...particle,
            life: particle.life - dt,
            vy: particle.vy + PARTICLE_GRAVITY * dt,
            x: particle.x + particle.vx * dt,
            y: particle.y + particle.vy * dt,
            rotation: particle.rotation + particle.angularVelocity * dt,
          }))
          .filter((particle) => particle.life > 0),
      );
    },
  };
}