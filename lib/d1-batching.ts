export function maxRowsPerInsert(columnCount: number, requestedRows: number, variableLimit = 90) {
  if (!Number.isInteger(columnCount) || columnCount < 1) throw new Error("columnCount must be a positive integer");
  const maxRowsByVariables = Math.floor(variableLimit / columnCount);
  if (maxRowsByVariables < 1) throw new Error("Too many bound columns for one insert");
  return Math.min(requestedRows, maxRowsByVariables);
}
