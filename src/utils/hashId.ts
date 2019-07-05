export const generateHashId = () => {
  return Math.random()
    .toString(36)
    .replace('0.', '')
    .toUpperCase();
};
