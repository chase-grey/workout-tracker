/**
 * One fact on a line of several ("set 2 of 2", "rest 1.5 min"), kept whole: its
 * spaces become non-breaking ones, so a line of facts joined by " · " that has
 * to wrap breaks between two facts and never strands half of one on the next
 * line.
 */
export const unbroken = (fact: string): string => fact.replace(/ /g, '\u00a0')
