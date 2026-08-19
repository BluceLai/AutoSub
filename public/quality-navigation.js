export function getQualityIssueNavigationIndex(issues, currentIndex, direction) {
  if (issues.length === 0) return -1;

  if (currentIndex < 0 || currentIndex >= issues.length) {
    return direction === "previous" ? issues.length - 1 : 0;
  }

  const delta = direction === "previous" ? -1 : 1;
  return (currentIndex + delta + issues.length) % issues.length;
}
