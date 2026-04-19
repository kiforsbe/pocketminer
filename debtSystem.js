export const STARTING_DEBT = 15000;
export const DEBT_TOTAL_SHIFTS = 30;
export const AMORTIZATION_PERIOD = 5;

const EXPECTED_INCOME_MIN = 15;
const EXPECTED_INCOME_MAX = 35000;
const PRINCIPAL_SHARE = 0.15;
const PAYMENT_PRINCIPAL_SHARE = 0.8;
const FAILURE_PENALTY_MULTIPLIER = 1.2;
const INITIAL_AMORTIZATION_SIZE = 500;
const AMORTIZATION_GROWTH = 1.5;

function clampCurrencyAmount(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

export class DebtSystem {
  static instance = null;

  static getInstance() {
    if (!DebtSystem.instance) {
      DebtSystem.instance = new DebtSystem();
    }

    return DebtSystem.instance;
  }

  constructor() {
    if (DebtSystem.instance) {
      return DebtSystem.instance;
    }

    DebtSystem.instance = this;
  }

  get startingDebt() {
    return STARTING_DEBT;
  }

  get totalShifts() {
    return DEBT_TOTAL_SHIFTS;
  }

  get amortizationPeriod() {
    return AMORTIZATION_PERIOD;
  }

  getExpectedIncomeForShift(shift) {
    const normalizedShift = Math.max(1, Math.min(DEBT_TOTAL_SHIFTS, Math.round(shift)));
    const progress = DEBT_TOTAL_SHIFTS <= 1 ? 1 : (normalizedShift - 1) / (DEBT_TOTAL_SHIFTS - 1);
    return EXPECTED_INCOME_MIN * Math.pow(EXPECTED_INCOME_MAX / EXPECTED_INCOME_MIN, progress);
  }

  getDebtScheduleForShift(shift, currentDebt) {
    const normalizedDebt = clampCurrencyAmount(currentDebt);
    const normalizedShift = Math.max(1, Math.round(shift));

    if (normalizedDebt <= 0 || normalizedShift > DEBT_TOTAL_SHIFTS) {
      return {
        shift: normalizedShift,
        expectedIncome: 0,
        principal: 0,
        interest: 0,
        payment: 0,
        penalty: 0,
      };
    }

    const expectedIncome = this.getExpectedIncomeForShift(normalizedShift);
    const principal = Math.min(normalizedDebt, Math.round(expectedIncome * PRINCIPAL_SHARE));
    const payment = Math.ceil(principal / PAYMENT_PRINCIPAL_SHARE);
    const interest = payment - principal;
    const penalty = Math.ceil(interest * FAILURE_PENALTY_MULTIPLIER);

    return {
      shift: normalizedShift,
      expectedIncome: clampCurrencyAmount(expectedIncome),
      principal,
      interest,
      payment,
      penalty,
    };
  }

  createDebtState({
    current = STARTING_DEBT,
    consecutiveFailures = 0,
    amortizationPaymentsMade = 0,
    lastAmortizationShift = 0,
  } = {}) {
    return {
      current: clampCurrencyAmount(current),
      consecutiveFailures: Math.max(0, Math.round(consecutiveFailures)),
      amortizationPaymentsMade: Math.max(0, Math.round(amortizationPaymentsMade)),
      lastAmortizationShift: Math.max(0, Math.round(lastAmortizationShift)),
      shiftGoal: 0,
      principalDue: 0,
      interestDue: 0,
    };
  }

  syncDebtStateForShift(debtState, shift) {
    if (!debtState) {
      return null;
    }

    const schedule = this.getDebtScheduleForShift(shift, debtState.current);
    debtState.shiftGoal = schedule.payment;
    debtState.principalDue = schedule.principal;
    debtState.interestDue = schedule.interest;
    return schedule;
  }

  getAmortizationAmount(debtState) {
    if (!debtState || debtState.current <= 0) {
      return 0;
    }

    const requestedAmount = Math.round(INITIAL_AMORTIZATION_SIZE * Math.pow(AMORTIZATION_GROWTH, debtState.amortizationPaymentsMade ?? 0));
    return Math.min(clampCurrencyAmount(requestedAmount), clampCurrencyAmount(debtState.current));
  }

  canAmortizeDebt(debtState, shift) {
    if (!debtState || debtState.current <= 0) {
      return false;
    }

    const normalizedShift = Math.max(1, Math.round(shift));
    return normalizedShift <= DEBT_TOTAL_SHIFTS
      && normalizedShift % AMORTIZATION_PERIOD === 0
      && debtState.lastAmortizationShift !== normalizedShift;
  }

  resolveDebtShift({ debtState, shift, bank }) {
    const schedule = this.getDebtScheduleForShift(shift, debtState?.current ?? 0);
    const startingDebt = clampCurrencyAmount(debtState?.current ?? 0);
    const startingBank = clampCurrencyAmount(bank);

    if (!debtState || schedule.payment <= 0) {
      return {
        shiftGoal: 0,
        startingDebt,
        remainingDebt: startingDebt,
        autoPayment: 0,
        paidPrincipal: 0,
        paidInterest: 0,
        debtIncrease: 0,
        penalty: 0,
        paymentSucceeded: true,
        consecutiveFailures: debtState?.consecutiveFailures ?? 0,
        bankAfterSettlement: startingBank,
        canAmortize: this.canAmortizeDebt(debtState, shift),
        amortizationAmount: this.getAmortizationAmount(debtState),
      };
    }

    const paymentSucceeded = startingBank >= schedule.payment;
    let nextDebt = startingDebt;
    let nextBank = startingBank;
    let paidPrincipal = 0;
    let paidInterest = 0;
    let debtIncrease = 0;

    if (paymentSucceeded) {
      nextBank -= schedule.payment;
      nextDebt = Math.max(0, startingDebt - schedule.principal);
      paidPrincipal = schedule.principal;
      paidInterest = schedule.interest;
      debtState.consecutiveFailures = 0;
    } else {
      debtIncrease = schedule.interest + schedule.penalty;
      nextDebt = startingDebt + debtIncrease;
      debtState.consecutiveFailures = Math.max(0, debtState.consecutiveFailures) + 1;
    }

    debtState.current = clampCurrencyAmount(nextDebt);

    return {
      shiftGoal: schedule.payment,
      startingDebt,
      remainingDebt: debtState.current,
      autoPayment: paymentSucceeded ? schedule.payment : 0,
      paidPrincipal,
      paidInterest,
      debtIncrease,
      penalty: paymentSucceeded ? 0 : schedule.penalty,
      paymentSucceeded,
      consecutiveFailures: debtState.consecutiveFailures,
      bankAfterSettlement: nextBank,
      canAmortize: this.canAmortizeDebt(debtState, shift),
      amortizationAmount: this.getAmortizationAmount(debtState),
    };
  }

  applyDebtAmortization({ debtState, shift, bank }) {
    const startingBank = clampCurrencyAmount(bank);
    if (!debtState || !this.canAmortizeDebt(debtState, shift)) {
      return {
        applied: false,
        amount: 0,
        remainingDebt: debtState?.current ?? 0,
        bankAfterAmortization: startingBank,
        nextAmortizationAmount: this.getAmortizationAmount(debtState),
      };
    }

    const amount = this.getAmortizationAmount(debtState);
    if (amount <= 0 || startingBank < amount) {
      return {
        applied: false,
        amount,
        remainingDebt: debtState.current,
        bankAfterAmortization: startingBank,
        nextAmortizationAmount: amount,
      };
    }

    debtState.current = Math.max(0, debtState.current - amount);
    debtState.amortizationPaymentsMade += 1;
    debtState.lastAmortizationShift = Math.max(1, Math.round(shift));

    return {
      applied: true,
      amount,
      remainingDebt: debtState.current,
      bankAfterAmortization: startingBank - amount,
      nextAmortizationAmount: this.getAmortizationAmount(debtState),
    };
  }
}

export const debtSystem = DebtSystem.getInstance();