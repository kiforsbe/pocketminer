import { ITEM_DEFINITIONS } from "./inventory.js";

const PICKUP_GRAVITY = 980;
const PICKUP_BOB_SPEED = 6;
const PICKUP_RADIUS = 10;
const PICKUP_MAGNET_RANGE = 86;
const PICKUP_COLLECT_RANGE = 20;

export function createPickupSystem({
  getPickups,
  setPickups,
  getPlayer,
  getWorld,
  getInventory,
  floatingTextSystem,
  audio,
  onItemCollected,
  onTreasureCollected,
}) {
  function spawnPickup(pickup) {
    getPickups().push(pickup);
  }

  function resolvePickupCollisions(pickup) {
    const world = getWorld();
    const floorTile = world.getTileAtPixel(pickup.x, pickup.y + pickup.radius + 1);
    if (floorTile?.solid) {
      const row = Math.floor((pickup.y + pickup.radius + 1) / 32);
      pickup.y = row * 32 - pickup.radius - 0.01;
      if (Math.abs(pickup.vy) > 80) {
        pickup.vy *= -0.28;
      } else {
        pickup.vy = 0;
        pickup.grounded = true;
      }
      pickup.vx *= 0.88;
    }

    const leftTile = world.getTileAtPixel(pickup.x - pickup.radius, pickup.y);
    if (leftTile?.solid) {
      const column = Math.floor((pickup.x - pickup.radius) / 32);
      pickup.x = (column + 1) * 32 + pickup.radius;
      pickup.vx = Math.abs(pickup.vx) * 0.35;
    }

    const rightTile = world.getTileAtPixel(pickup.x + pickup.radius, pickup.y);
    if (rightTile?.solid) {
      const column = Math.floor((pickup.x + pickup.radius) / 32);
      pickup.x = column * 32 - pickup.radius;
      pickup.vx = -Math.abs(pickup.vx) * 0.35;
    }
  }

  return {
    spawnResources(miningResult, quantity) {
      const definition = ITEM_DEFINITIONS[miningResult.resource];
      if (!definition) {
        return;
      }

      const player = getPlayer();
      const originX = miningResult.column * 32 + 16;
      const originY = miningResult.row * 32 + 18;
      const direction = player.getCenter().x <= originX ? 1 : -1;

      for (let index = 0; index < quantity; index += 1) {
        spawnPickup({
          itemId: miningResult.resource,
          x: originX + (Math.random() - 0.5) * 8,
          y: originY + (Math.random() - 0.5) * 6,
          vx: direction * (70 + Math.random() * 90) + (Math.random() - 0.5) * 45,
          vy: -(140 + Math.random() * 95),
          grounded: false,
          rotation: Math.random() * Math.PI * 2,
          angularVelocity: (Math.random() - 0.5) * 6,
          bobTime: Math.random() * Math.PI * 2,
          radius: PICKUP_RADIUS,
          color: definition.color,
          glow: definition.glow,
        });
      }
    },

    spawnTreasure(chest, column, row) {
      const player = getPlayer();
      const originX = column * 32 + 16;
      const originY = row * 32 + 18;
      const direction = player.getCenter().x <= originX ? 1 : -1;

      spawnPickup({
        kind: "treasure",
        chest,
        x: originX,
        y: originY,
        vx: direction * (84 + Math.random() * 40),
        vy: -(150 + Math.random() * 70),
        grounded: false,
        rotation: Math.random() * Math.PI * 2,
        angularVelocity: (Math.random() - 0.5) * 4,
        bobTime: Math.random() * Math.PI * 2,
        radius: PICKUP_RADIUS + 4,
        color: "#f4c65c",
        glow: "rgba(244, 198, 92, 0.45)",
        accent: "#fff2c4",
      });
    },

    update(dt) {
      const player = getPlayer();
      const inventory = getInventory();
      const playerCenter = player.getCenter();
      const remainingPickups = [];

      for (const pickup of getPickups()) {
        const nextPickup = { ...pickup, bobTime: pickup.bobTime + dt * PICKUP_BOB_SPEED };
        const dx = playerCenter.x - nextPickup.x;
        const dy = playerCenter.y - nextPickup.y;
        const distance = Math.hypot(dx, dy);
        const isTreasure = nextPickup.kind === "treasure";
        const canCollect = isTreasure || inventory.hasSpaceFor(nextPickup.itemId, 1);

        if (canCollect && distance < PICKUP_MAGNET_RANGE) {
          const attraction = isTreasure
            ? Math.max(140, 340 - distance * 1.4)
            : Math.max(90, 280 - distance * 1.7);
          nextPickup.vx += (dx / Math.max(distance, 1)) * attraction * dt;
          nextPickup.vy += (dy / Math.max(distance, 1)) * attraction * dt;
        }

        nextPickup.vy += PICKUP_GRAVITY * dt;
        nextPickup.x += nextPickup.vx * dt;
        nextPickup.y += nextPickup.vy * dt;
        nextPickup.rotation += nextPickup.angularVelocity * dt;
        nextPickup.grounded = false;

        resolvePickupCollisions(nextPickup);

        if (canCollect && distance < (isTreasure ? PICKUP_COLLECT_RANGE + 8 : PICKUP_COLLECT_RANGE)) {
          if (isTreasure) {
            audio.playSound("treasureChest", { volume: 0.24 });
            onTreasureCollected(nextPickup.chest);
            continue;
          }

          const result = inventory.addItem(nextPickup.itemId, 1);
          if (result.added > 0) {
            onItemCollected(nextPickup.itemId);
            const nextPlayerCenter = player.getCenter();
            floatingTextSystem.spawnPickupText({
              itemId: nextPickup.itemId,
              originX: nextPlayerCenter.x,
              originY: player.y - 12,
            });
            audio.playSound("orePop", { playbackRate: 1.16 + Math.random() * 0.08, volume: 0.18 });
            continue;
          }
        }

        remainingPickups.push(nextPickup);
      }

      setPickups(remainingPickups);
    },
  };
}