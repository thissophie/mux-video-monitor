type AppendChild = {
  <T extends Node>(param: T): T;
  (param: string): Text;
};

export const appendChild =
  (base: HTMLElement): AppendChild =>
  <T extends Node>(child: T | string) => {
    if (typeof child === 'string') {
      const node = document.createTextNode(child);
      base.appendChild(node);
      return node;
    } else {
      base.appendChild(child);
      return child;
    }
  };

type Attributes = Record<string, string>;

type ElmChild<T extends Node> = T | string;
type ElmChildren<T extends Node> = ElmChild<T>[] | ElmChild<T>;

const wrap = <T>(childOrChildren: T | T[]) => {
  if (Array.isArray(childOrChildren)) {
    return childOrChildren;
  } else {
    return [childOrChildren];
  }
};

export const elm =
  <K extends keyof HTMLElementTagNameMap>(tagName: K) =>
  <T extends Node>(childOrChildren: ElmChildren<T>, attributes: Attributes = {}): HTMLElementTagNameMap[K] => {
    const base = document.createElement(tagName);
    const append = appendChild(base);

    for (const [key, value] of Object.entries(attributes)) {
      base.setAttribute(key, value);
    }

    const children = wrap(childOrChildren);
    children.map(append);

    return base;
  };

export const a = elm('a');

export const h2 = elm('h2');

export const anchor = <T extends Node>(
  href: string,
  childOrChildren: ElmChildren<T>,
  classList?: string[],
): HTMLAnchorElement => a(childOrChildren, { href, class: classList?.join(' ') });

export const listItem = elm('li');
export const div = elm('div');
