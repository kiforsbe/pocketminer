const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PASSWORD_ALPHABET_MAP = new Map([...PASSWORD_ALPHABET].map((character, index) => [character, index]));
const PASSWORD_DATA_CHAR_COUNT = 11;
const PASSWORD_TOTAL_CHAR_COUNT = 12;
const PASSWORD_GROUP_SIZE = 4;
const PASSWORD_VERSION = 1;
const PASSWORD_ROUND_MIN = 1;
const PASSWORD_ROUND_MAX = 32;
const PASSWORD_BANK_BUCKET = 500;
const PASSWORD_BANK_BUCKET_MAX = 127;
const PASSWORD_BONUS_RESTORE_VALUES = Object.freeze([0, 0.1, 0.25, 0.5]);
const PASSWORD_BONUS_THRESHOLDS = Object.freeze([0.05, 0.175, 0.375]);

export const PASSWORD_BONUS_KEYS = Object.freeze([
  "moveSpeed",
  "jumpPower",
  "swingRate",
  "platformCooldown",
  "bombDamage",
  "bombRestock",
  "pickupMagnetism",
  "luck",
  "mastery",
  "toolDamage",
]);

function clampInteger(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

function packField(payload, value, bitCount) {
  return (payload << BigInt(bitCount)) | BigInt(value);
}

function unpackField(payload, bitCount) {
  const mask = (1n << BigInt(bitCount)) - 1n;
  return {
    value: Number(payload & mask),
    payload: payload >> BigInt(bitCount),
  };
}

function encodeBase32Payload(payload, characterCount) {
  let remaining = payload;
  let encoded = "";

  for (let index = 0; index < characterCount; index += 1) {
    const value = Number(remaining & 31n);
    encoded = PASSWORD_ALPHABET[value] + encoded;
    remaining >>= 5n;
  }

  return encoded;
}

function decodeBase32Payload(password) {
  let payload = 0n;

  for (const character of password) {
    const value = PASSWORD_ALPHABET_MAP.get(character);
    if (value === undefined) {
      throw new Error("Password contains unsupported characters.");
    }

    payload = (payload << 5n) | BigInt(value);
  }

  return payload;
}

function computeChecksumCharacter(dataCharacters) {
  let checksum = 0;

  for (let index = 0; index < dataCharacters.length; index += 1) {
    const value = PASSWORD_ALPHABET_MAP.get(dataCharacters[index]) ?? 0;
    checksum = (checksum + value * (index + 3)) % PASSWORD_ALPHABET.length;
  }

  return PASSWORD_ALPHABET[checksum];
}

export function normalizePasswordInput(value = "") {
  const filtered = String(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, PASSWORD_TOTAL_CHAR_COUNT);

  return [...filtered]
    .filter((character) => PASSWORD_ALPHABET_MAP.has(character))
    .join("");
}

export function formatPassword(value = "") {
  const normalized = normalizePasswordInput(value);
  const groups = [];

  for (let index = 0; index < normalized.length; index += PASSWORD_GROUP_SIZE) {
    groups.push(normalized.slice(index, index + PASSWORD_GROUP_SIZE));
  }

  return groups.join("-");
}

export function quantizeBonusValue(value) {
  const normalizedValue = clampNumber(value, 0, Number.POSITIVE_INFINITY);

  if (normalizedValue < PASSWORD_BONUS_THRESHOLDS[0]) {
    return 0;
  }

  if (normalizedValue < PASSWORD_BONUS_THRESHOLDS[1]) {
    return 1;
  }

  if (normalizedValue < PASSWORD_BONUS_THRESHOLDS[2]) {
    return 2;
  }

  return 3;
}

export function restoreBonusValue(tier) {
  return PASSWORD_BONUS_RESTORE_VALUES[clampInteger(tier, 0, PASSWORD_BONUS_RESTORE_VALUES.length - 1)];
}

export function quantizeBankValue(value) {
  const bankValue = clampNumber(value, 0, Number.POSITIVE_INFINITY);
  return clampInteger(Math.round(bankValue / PASSWORD_BANK_BUCKET), 0, PASSWORD_BANK_BUCKET_MAX);
}

export function restoreBankValue(bucketIndex) {
  return clampInteger(bucketIndex, 0, PASSWORD_BANK_BUCKET_MAX) * PASSWORD_BANK_BUCKET;
}

export function clampRoundValue(value) {
  return clampInteger(value, PASSWORD_ROUND_MIN, PASSWORD_ROUND_MAX);
}

export function encodePassword(progress) {
  const normalizedBonuses = PASSWORD_BONUS_KEYS.map((key) => quantizeBonusValue(progress.bonuses?.[key] ?? 0));
  const fields = [
    [PASSWORD_VERSION, 2],
    [clampInteger(progress.pickaxeTier, 0, 15), 4],
    [clampInteger(progress.bagTier, 0, 3), 2],
    [clampInteger(progress.capacityTier, 0, 7), 3],
    [clampInteger(progress.timeTier, 0, 3), 2],
    [clampInteger(progress.platformTier, 0, 3), 2],
    [clampInteger(progress.bombUnlocked ? 1 : 0, 0, 1), 1],
    [clampInteger(progress.bombCapacityTier, 0, 3), 2],
    [clampInteger(progress.bombTypeTier, 0, 3), 2],
    [clampRoundValue(progress.round) - 1, 5],
    [quantizeBankValue(progress.bank), 7],
    ...normalizedBonuses.map((tier) => [tier, 2]),
  ];

  let payload = 0n;
  for (const [value, bitCount] of fields) {
    payload = packField(payload, value, bitCount);
  }

  const dataCharacters = encodeBase32Payload(payload, PASSWORD_DATA_CHAR_COUNT);
  return `${dataCharacters}${computeChecksumCharacter(dataCharacters)}`;
}

export function decodePassword(value) {
  const normalized = normalizePasswordInput(value);
  if (normalized.length !== PASSWORD_TOTAL_CHAR_COUNT) {
    throw new Error("Password must be 12 characters.");
  }

  const dataCharacters = normalized.slice(0, PASSWORD_DATA_CHAR_COUNT);
  const checksumCharacter = normalized.slice(PASSWORD_DATA_CHAR_COUNT);
  if (computeChecksumCharacter(dataCharacters) !== checksumCharacter) {
    throw new Error("Password checksum does not match.");
  }

  let payload = decodeBase32Payload(dataCharacters);
  const bonusTiers = new Array(PASSWORD_BONUS_KEYS.length);
  for (let index = PASSWORD_BONUS_KEYS.length - 1; index >= 0; index -= 1) {
    const unpackedBonus = unpackField(payload, 2);
    bonusTiers[index] = unpackedBonus.value;
    payload = unpackedBonus.payload;
  }

  let unpacked = unpackField(payload, 7);
  const bankBucket = unpacked.value;
  payload = unpacked.payload;

  unpacked = unpackField(payload, 5);
  const roundValue = unpacked.value;
  payload = unpacked.payload;

  unpacked = unpackField(payload, 2);
  const bombTypeTier = unpacked.value;
  payload = unpacked.payload;

  unpacked = unpackField(payload, 2);
  const bombCapacityTier = unpacked.value;
  payload = unpacked.payload;

  unpacked = unpackField(payload, 1);
  const bombUnlocked = unpacked.value === 1;
  payload = unpacked.payload;

  unpacked = unpackField(payload, 2);
  const platformTier = unpacked.value;
  payload = unpacked.payload;

  unpacked = unpackField(payload, 2);
  const timeTier = unpacked.value;
  payload = unpacked.payload;

  unpacked = unpackField(payload, 3);
  const capacityTier = unpacked.value;
  payload = unpacked.payload;

  unpacked = unpackField(payload, 2);
  const bagTier = unpacked.value;
  payload = unpacked.payload;

  unpacked = unpackField(payload, 4);
  const pickaxeTier = unpacked.value;
  payload = unpacked.payload;

  unpacked = unpackField(payload, 2);
  const version = unpacked.value;

  if (version !== PASSWORD_VERSION) {
    throw new Error("Password version is not supported.");
  }

  const bonuses = {};
  PASSWORD_BONUS_KEYS.forEach((key, index) => {
    bonuses[key] = restoreBonusValue(bonusTiers[index]);
  });

  return {
    version,
    pickaxeTier,
    bagTier,
    capacityTier,
    timeTier,
    platformTier,
    bombUnlocked,
    bombCapacityTier,
    bombTypeTier,
    round: roundValue + 1,
    bank: restoreBankValue(bankBucket),
    bonuses,
  };
}

export function getPasswordHelpText() {
  return "12 chars. Unlocks are exact. Bank and bonuses are rounded.";
}