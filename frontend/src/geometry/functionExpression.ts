export class FunctionExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FunctionExpressionError";
  }
}

type Token =
  | { type: "number"; value: number }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: "+" | "-" | "*" | "/" | "^" }
  | { type: "paren"; value: "(" | ")" }
  | { type: "comma"; value: "," };

type AstNode =
  | { type: "number"; value: number }
  | { type: "variable" }
  | { type: "constant"; value: number }
  | { type: "unary"; operator: "+" | "-"; operand: AstNode }
  | { type: "binary"; operator: "+" | "-" | "*" | "/" | "^"; left: AstNode; right: AstNode }
  | { type: "call"; name: string; args: AstNode[] };

const ALLOWED_INPUT = /^[0-9a-zA-Z_+\-*/^().,\s=]+$/;

const CONSTANTS: Readonly<Record<string, number>> = {
  e: Math.E,
  pi: Math.PI,
};

const FUNCTIONS: Readonly<Record<string, (...args: number[]) => number>> = {
  abs: Math.abs,
  acos: Math.acos,
  acosh: Math.acosh,
  asin: Math.asin,
  asinh: Math.asinh,
  atan: Math.atan,
  atanh: Math.atanh,
  ceil: Math.ceil,
  ceiling: Math.ceil,
  cos: Math.cos,
  cosh: Math.cosh,
  cot: (x: number) => 1 / Math.tan(x),
  csc: (x: number) => 1 / Math.sin(x),
  exp: Math.exp,
  floor: Math.floor,
  ln: Math.log,
  log: Math.log,
  sec: (x: number) => 1 / Math.cos(x),
  sign: Math.sign,
  sin: Math.sin,
  sinh: Math.sinh,
  sqrt: Math.sqrt,
  tan: Math.tan,
  tanh: Math.tanh,
};

export function normalizeFunctionExpression(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new FunctionExpressionError("The function expression cannot be empty.");
  }
  if (!ALLOWED_INPUT.test(trimmed)) {
    throw new FunctionExpressionError("The expression contains unsupported characters.");
  }

  const expression = trimmed.replace(/^\s*y\s*=\s*/i, "");
  if (!expression) {
    throw new FunctionExpressionError("Write an expression for y, for example y = sin(x).");
  }

  const canonical = expression
    .replace(/\*\*/g, "^")
    .replace(/([A-Za-z_][A-Za-z0-9_]*)/g, (match) => match.toLowerCase());

  compileFunctionExpression(canonical);
  return canonical;
}

export function compileFunctionExpression(expression: string): (x: number) => number {
  const tokens = insertImplicitMultiplication(tokenize(expression));
  const parser = new Parser(tokens);
  const ast = parser.parse();
  return (x: number) => {
    const value = evaluateAst(ast, x);
    if (!Number.isFinite(value)) {
      throw new FunctionExpressionError("The function is not defined at that x value.");
    }
    return value;
  };
}

export function parseFunctionObjectCommand(command: string): { id: string; expression: string } | null {
  const trimmed = command.trim();
  const functionMatch = trimmed.match(
    /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*Function\s*\((.*)\)\s*$/i,
  );
  if (functionMatch) {
    return {
      id: functionMatch[1],
      expression: normalizeFunctionExpression(functionMatch[2]),
    };
  }

  const directMatch = trimmed.match(
    /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(y\s*=\s*.+)$/i,
  );
  if (directMatch) {
    return {
      id: directMatch[1],
      expression: normalizeFunctionExpression(directMatch[2]),
    };
  }

  return null;
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];
    if (char === undefined) break;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      let end = index + 1;
      while (end < expression.length && /[0-9.]/.test(expression[end]!)) end += 1;
      const value = Number(expression.slice(index, end));
      if (!Number.isFinite(value)) {
        throw new FunctionExpressionError("Invalid numeric literal in the function.");
      }
      tokens.push({ type: "number", value });
      index = end;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let end = index + 1;
      while (end < expression.length && /[A-Za-z0-9_]/.test(expression[end]!)) end += 1;
      tokens.push({ type: "identifier", value: expression.slice(index, end).toLowerCase() });
      index = end;
      continue;
    }
    if (char === "+" || char === "-" || char === "*" || char === "/" || char === "^") {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }
    if (char === "(" || char === ")") {
      tokens.push({ type: "paren", value: char });
      index += 1;
      continue;
    }
    if (char === ",") {
      tokens.push({ type: "comma", value: "," });
      index += 1;
      continue;
    }
    throw new FunctionExpressionError(`Unsupported token '${char}' in the function.`);
  }

  return tokens;
}

function insertImplicitMultiplication(tokens: Token[]): Token[] {
  const result: Token[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index]!;
    const next = tokens[index + 1];
    result.push(current);
    if (next === undefined) continue;

    const currentEndsValue =
      current.type === "number" ||
      current.type === "identifier" ||
      (current.type === "paren" && current.value === ")");
    const nextStartsValue =
      next.type === "number" ||
      next.type === "identifier" ||
      (next.type === "paren" && next.value === "(");
    const isFunctionCall = current.type === "identifier" && next.type === "paren" && next.value === "(";

    if (currentEndsValue && nextStartsValue && !isFunctionCall) {
      result.push({ type: "operator", value: "*" });
    }
  }

  return result;
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  parse(): AstNode {
    if (this.tokens.length === 0) {
      throw new FunctionExpressionError("The function expression cannot be empty.");
    }
    const node = this.parseExpression();
    if (this.peek() !== undefined) {
      throw new FunctionExpressionError("Invalid function syntax.");
    }
    return node;
  }

  private parseExpression(): AstNode {
    let node = this.parseTerm();
    while (this.matchOperator("+") || this.matchOperator("-")) {
      const operator = this.previousOperator();
      const right = this.parseTerm();
      node = { type: "binary", operator, left: node, right };
    }
    return node;
  }

  private parseTerm(): AstNode {
    let node = this.parseUnary();
    while (this.matchOperator("*") || this.matchOperator("/")) {
      const operator = this.previousOperator();
      const right = this.parseUnary();
      node = { type: "binary", operator, left: node, right };
    }
    return node;
  }

  private parseUnary(): AstNode {
    if (this.matchOperator("+")) {
      return { type: "unary", operator: "+", operand: this.parseUnary() };
    }
    if (this.matchOperator("-")) {
      return { type: "unary", operator: "-", operand: this.parseUnary() };
    }
    return this.parsePower();
  }

  private parsePower(): AstNode {
    let node = this.parsePrimary();
    if (this.matchOperator("^")) {
      const right = this.parseUnary();
      node = { type: "binary", operator: "^", left: node, right };
    }
    return node;
  }

  private parsePrimary(): AstNode {
    const token = this.peek();
    if (token === undefined) {
      throw new FunctionExpressionError("The expression is incomplete.");
    }

    if (token.type === "number") {
      this.index += 1;
      return { type: "number", value: token.value };
    }

    if (token.type === "identifier") {
      this.index += 1;
      if (this.matchParen("(")) {
        const args: AstNode[] = [];
        if (!this.checkParen(")")) {
          do {
            args.push(this.parseExpression());
          } while (this.matchComma());
        }
        this.consumeParen(")");
        return { type: "call", name: token.value, args };
      }
      if (token.value === "x") {
        return { type: "variable" };
      }
      const constant = CONSTANTS[token.value];
      if (constant !== undefined) {
        return { type: "constant", value: constant };
      }
      throw new FunctionExpressionError(`Unknown symbol '${token.value}'.`);
    }

    if (this.matchParen("(")) {
      const node = this.parseExpression();
      this.consumeParen(")");
      return node;
    }

    throw new FunctionExpressionError("Invalid function syntax.");
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private matchOperator(operator: Token extends never ? never : "+" | "-" | "*" | "/" | "^"): boolean {
    const token = this.peek();
    if (token?.type === "operator" && token.value === operator) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private previousOperator(): "+" | "-" | "*" | "/" | "^" {
    const token = this.tokens[this.index - 1];
    if (token?.type !== "operator") {
      throw new FunctionExpressionError("Invalid operator placement.");
    }
    return token.value;
  }

  private matchParen(paren: "(" | ")"): boolean {
    const token = this.peek();
    if (token?.type === "paren" && token.value === paren) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private checkParen(paren: "(" | ")"): boolean {
    const token = this.peek();
    return token?.type === "paren" && token.value === paren;
  }

  private consumeParen(paren: ")"): void {
    if (!this.matchParen(paren)) {
      throw new FunctionExpressionError("Missing closing parenthesis.");
    }
  }

  private matchComma(): boolean {
    const token = this.peek();
    if (token?.type === "comma") {
      this.index += 1;
      return true;
    }
    return false;
  }
}

function evaluateAst(node: AstNode, x: number): number {
  switch (node.type) {
    case "number":
      return node.value;
    case "variable":
      return x;
    case "constant":
      return node.value;
    case "unary": {
      const operand = evaluateAst(node.operand, x);
      return node.operator === "-" ? -operand : operand;
    }
    case "binary": {
      const left = evaluateAst(node.left, x);
      const right = evaluateAst(node.right, x);
      switch (node.operator) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return left / right;
        case "^":
          return left ** right;
      }
    }
    case "call": {
      const fn = FUNCTIONS[node.name];
      if (fn === undefined) {
        throw new FunctionExpressionError(`Unknown function '${node.name}'.`);
      }
      const args = node.args.map((arg) => evaluateAst(arg, x));
      const value = fn(...args);
      if (typeof value !== "number" || Number.isNaN(value)) {
        throw new FunctionExpressionError(`The function '${node.name}' returned an invalid value.`);
      }
      return value;
    }
  }
}
