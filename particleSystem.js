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