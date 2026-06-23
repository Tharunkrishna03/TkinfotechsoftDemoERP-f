export const PAGE_SIZE_OPTIONS = [10, 20, 30];

export const MONTH_OPTIONS = [
  { value: "", label: "All Months" },
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

export function matchesSelectedMonth(value, selectedMonth) {
  if (!selectedMonth) {
    return true;
  }

  if (!value) {
    return false;
  }

  const parsedDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  return parsedDate.getMonth() + 1 === Number(selectedMonth);
}
