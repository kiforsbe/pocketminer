export const ITEM_DEFINITIONS = Object.freeze({
  coal: {
    label: "Coal",
    shortLabel: "C",
    color: "#2f2a33",
    glow: "rgba(230, 204, 126, 0.35)",
    value: 1,
  },
  copper: {
    label: "Copper",
    shortLabel: "Cu",
    color: "#c97a43",
    glow: "rgba(237, 162, 112, 0.38)",
    value: 2,
  },
  tin: {
    label: "Tin",
    shortLabel: "Ti",
    color: "#d7e1e8",
    glow: "rgba(213, 229, 236, 0.42)",
    value: 3,
  },
  iron: {
    label: "Iron",
    shortLabel: "I",
    color: "#cf7449",
    glow: "rgba(255, 211, 148, 0.45)",
    value: 5,
  },
  silver: {
    label: "Silver",
    shortLabel: "Ag",
    color: "#d7dce6",
    glow: "rgba(234, 240, 255, 0.45)",
    value: 9,
  },
  gold: {
    label: "Gold",
    shortLabel: "Au",
    color: "#e0ba4e",
    glow: "rgba(255, 226, 132, 0.48)",
    value: 14,
  },
  ruby: {
    label: "Ruby",
    shortLabel: "Rb",
    color: "#da4d68",
    glow: "rgba(255, 137, 164, 0.42)",
    value: 24,
  },
  sapphire: {
    label: "Sapphire",
    shortLabel: "Sa",
    color: "#58a8ea",
    glow: "rgba(128, 199, 255, 0.44)",
    value: 28,
  },
});

export class Inventory {
  constructor({ slotCount = 8, stackSize = 8 } = {}) {
    this.slotCount = slotCount;
    this.stackSize = stackSize;
    this.slots = Array.from({ length: slotCount }, () => null);
  }

  addItem(itemId, quantity = 1) {
    let remaining = quantity;

    for (const slot of this.slots) {
      if (!slot || slot.itemId !== itemId || slot.count >= this.stackSize) {
        continue;
      }

      const added = Math.min(this.stackSize - slot.count, remaining);
      slot.count += added;
      remaining -= added;
      if (remaining === 0) {
        return { added: quantity, remaining: 0 };
      }
    }

    for (let index = 0; index < this.slots.length; index += 1) {
      if (this.slots[index]) {
        continue;
      }

      const added = Math.min(this.stackSize, remaining);
      this.slots[index] = { itemId, count: added };
      remaining -= added;
      if (remaining === 0) {
        break;
      }
    }

    return { added: quantity - remaining, remaining };
  }

  hasSpaceFor(itemId, quantity = 1) {
    let capacity = 0;

    for (const slot of this.slots) {
      if (!slot) {
        capacity += this.stackSize;
      } else if (slot.itemId === itemId) {
        capacity += this.stackSize - slot.count;
      }

      if (capacity >= quantity) {
        return true;
      }
    }

    return false;
  }

  getSlots() {
    return this.slots;
  }

  getTotals() {
    return this.slots.reduce((totals, slot) => {
      if (slot) {
        totals[slot.itemId] = (totals[slot.itemId] ?? 0) + slot.count;
      }
      return totals;
    }, Object.fromEntries(Object.keys(ITEM_DEFINITIONS).map((itemId) => [itemId, 0])));
  }

  getItemCount() {
    return this.slots.reduce((count, slot) => count + (slot?.count ?? 0), 0);
  }

  getOccupiedSlotCount() {
    return this.slots.reduce((count, slot) => count + (slot ? 1 : 0), 0);
  }
}