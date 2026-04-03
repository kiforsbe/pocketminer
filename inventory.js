export const ITEM_DEFINITIONS = Object.freeze({
  coal: {
    label: "Coal",
    shortLabel: "C",
    color: "#2f2a33",
    glow: "rgba(230, 204, 126, 0.35)",
  },
  iron: {
    label: "Iron",
    shortLabel: "I",
    color: "#cf7449",
    glow: "rgba(255, 211, 148, 0.45)",
  },
});

export class Inventory {
  constructor({ slotCount = 9, stackSize = 8 } = {}) {
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
    }, { coal: 0, iron: 0 });
  }
}