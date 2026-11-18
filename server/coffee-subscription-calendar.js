"use strict";

// Days the shop does not ship 珈琲の定期便 (besides Saturdays and Sundays), as data. Shipping dates falling on one of
// them move to the next working day (server/coffee-subscription-plan.js shippingDates).
// Japanese public holidays 2026–2027 (内閣府「国民の祝日」, including substitute holidays and the 国民の休日 of
// 2026-09-22). To be checked against the Cabinet Office table and extended every year.
const HOLIDAYS = [
  // 2026
  "2026-01-01", "2026-01-12", "2026-02-11", "2026-02-23", "2026-03-20", "2026-04-29", "2026-05-03", "2026-05-04",
  "2026-05-05", "2026-05-06", "2026-07-20", "2026-08-11", "2026-09-21", "2026-09-22", "2026-09-23", "2026-10-12",
  "2026-11-03", "2026-11-23",
  // 2027
  "2027-01-01", "2027-01-11", "2027-02-11", "2027-02-23", "2027-03-21", "2027-03-22", "2027-04-29", "2027-05-03",
  "2027-05-04", "2027-05-05", "2027-07-19", "2027-08-11", "2027-09-20", "2027-09-23", "2027-10-11", "2027-11-03",
  "2027-11-23",
];

// Shop closures (e.g. year-end holidays): not decided yet, so none. Add "YYYY-MM-DD" days here when the CEO sets them.
const CLOSURES = [];

const CALENDAR = Object.freeze({ holidays: new Set(HOLIDAYS), closures: new Set(CLOSURES) });

module.exports = { CALENDAR, HOLIDAYS, CLOSURES };
