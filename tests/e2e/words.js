// Saves one word list (selected) the way the form stores it, then opens `url`.
export async function useWords(page, pairs, url = '/', kind = 'en-he') {
  await page.evaluate(({ pairs, kind }) => {
    const lists = [{ id: 'test-list', name: 'Test words', kind, locked: false, pairs }];
    localStorage.setItem('balloon-archer-lists', JSON.stringify({ version: 1, selectedId: 'test-list', lists }));
  }, { pairs, kind });
  await page.goto(url);
}

export const pairs = (...items) =>
  items.map((item) => {
    const [en, he] = item.split('=');
    return { en, he };
  });
