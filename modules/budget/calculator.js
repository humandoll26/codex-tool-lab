const MAX = BigInt(Number.MAX_SAFE_INTEGER);

export function calculateBudget(project) {
  const data = project.modules.budget.data;
  const prices = new Map(project.ticket.priceCategories.map(p => [p.id, p.price]));
  let attendees = 0n, revenue = 0n;
  for (const sale of data.plannedSales) {
    attendees += BigInt(sale.quantity);
    revenue += BigInt(sale.quantity) * BigInt(prices.get(sale.priceCategoryId));
  }
  const capacity = project.performanceDates.reduce((sum, s) => sum + BigInt(s.capacity), 0n);
  const fixed = data.fixedCosts.reduce((sum, c) => sum + BigInt(c.amount), 0n);
  const expenses = fixed + attendees * BigInt(data.variableCostPerAttendee);
  const profit = revenue - expenses;
  const margin = BigInt(prices.get(data.referencePriceCategoryId)) - BigInt(data.variableCostPerAttendee);
  let breakEven = null;
  if (fixed === 0n && margin >= 0n) breakEven = 0n;
  else if (margin > 0n) breakEven = (fixed + margin - 1n) / margin;
  for (const value of [attendees, revenue, capacity, fixed, expenses, profit, breakEven]) {
    if (value !== null && (value > MAX || value < -MAX)) throw new RangeError('計算結果が安全な整数範囲を超えています。');
  }
  return { attendees: Number(attendees), revenue: Number(revenue), capacity: Number(capacity),
    fixed: Number(fixed), expenses: Number(expenses), profit: Number(profit),
    salesRate: capacity === 0n ? null : Number(attendees) / Number(capacity) * 100,
    breakEven: breakEven === null ? null : Number(breakEven),
    exceedsCapacity: breakEven !== null && breakEven > capacity };
}
