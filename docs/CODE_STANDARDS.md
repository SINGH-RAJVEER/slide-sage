# Code Standards

Clean code guidelines and standards for SlideSage development.

## Quick Reference

| Area           | Standard                 | Tools                               |
| -------------- | ------------------------ | ----------------------------------- |
| **Language**   | TypeScript (strict mode) | Bun compiler                        |
| **Linting**    | Biome configuration      | `bun lint`                          |
| **Formatting** | Biome formatter          | `bun format`                        |
| **Testing**    | Bun Test + RTL           | `bun test`                          |
| **Git**        | Conventional commits     | `git commit -m "feat: add feature"` |

---

## Core Principles

1. **Single Responsibility**: Functions and components do one thing well
2. **Composition over Inheritance**: Prefer functional composition
3. **Type Safety**: No `any` types, strict TypeScript
4. **Small Files**: Keep files under 200 lines when possible
5. **Clear Naming**: Functions named after what they do

---

## Web Standards

### Component Structure

```tsx
// Good: Small, focused component
export function UserProfile({ user }: { user: User }) {
  return (
    <div className="user-profile">
      <img src={user.avatar} alt={user.name} />
      <h2>{user.name}</h2>
    </div>
  );
}

// Bad: Large component with multiple concerns
export function UserManagement() {
  // 300+ lines of mixed concerns
}
```

### State Management

```tsx
// Good: Use custom hooks
function useUserData() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  // Hook logic...
  return { users, loading };
}

// Bad: Direct fetch in component
function UserList() {
  useEffect(() => {
    fetch("/api/users").then((res) => res.json());
  }, []);
}
```

### Styling

```tsx
// Good: Tailwind utility classes
<div className="flex items-center justify-between p-4 bg-white rounded-lg shadow">

// Bad: Inline styles
<div style={{ display: 'flex', alignItems: 'center' }}>
```

---

## APIs Standards

### Route Structure

```typescript
// Good: Thin controller
app.post("/users", authMiddleware, async (c) => {
  const data = (await c.req.json()) as CreateUserRequest;
  const user = await userService.createUser(data);
  return c.json({ user }, 201);
});

// Bad: Business logic in route
app.post("/users", async (c) => {
  const data = await c.req.json();
  // Validation, hashing, database calls all here
});
```

### Service Layer

```typescript
// Good: Clean service with single responsibility
export class UserService {
  async createUser(data: CreateUserRequest): Promise<User> {
    // Validate and create user
    return await this.userRepo.create(data);
  }
}

// Bad: Mixed concerns
export class UserService {
  async createUserAndSendEmail(data) {
    // User creation + email sending + logging + analytics
  }
}
```

### Database Access

```typescript
// Good: Repository pattern with Drizzle
async findById(id: number): Promise<User | null> {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return result[0] || null;
}

// Bad: Raw SQL strings
async findById(id: number) {
  return await db.query(`SELECT * FROM users WHERE id = ${id}`);
}
```

---

## Error Handling

### Consistent Error Format

```typescript
// Good: Structured error response
return c.json(
  {
    error: {
      message: "User not found",
      code: "USER_NOT_FOUND",
    },
  },
  404,
);

// Bad: Inconsistent errors
return c.json({ error: "Not found" }, 404);
return c.json("Something went wrong", 500);
```

### Error Logging

```typescript
// Good: Proper error handling
try {
  await operation();
} catch (error) {
  logger.error("Operation failed", { error: error.message, userId });
  throw new ApplicationError("Operation failed", "OPERATION_ERROR");
}
```

---

## Naming Conventions

| Context              | Convention       | Example                                    |
| -------------------- | ---------------- | ------------------------------------------ |
| **Files**            | kebab-case       | `user-service.ts`, `profile.component.tsx` |
| **Components**       | PascalCase       | `UserProfile`, `NavigationMenu`            |
| **Functions**        | camelCase        | `getUserById()`, `createPresentation()`    |
| **Constants**        | UPPER_SNAKE_CASE | `API_BASE_URL`, `MAX_RETRIES`              |
| **Types/Interfaces** | PascalCase       | `User`, `CreateUserRequest`                |
| **Variables**        | camelCase        | `userId`, `presentationData`               |

---

## Git Workflow

### Commit Message Format

```
<type>(<scope>): <description>

feat(auth): add Google OAuth integration
fix(api): handle null values in user response
docs(readme): update installation instructions
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation change
- `style`: Code formatting (no logic change)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Build process or dependency changes

---

## Performance Guidelines

### Web

- Use `React.memo` for expensive components
- Implement proper loading states
- Optimize bundle size with code splitting
- Use `useCallback` and `useMemo` appropriately

### APIs

- Use database indexes for frequently queried fields
- Implement connection pooling (built into Bun)
- Cache frequently accessed data
- Use parameterized queries (Drizzle handles this)

---

## Security Guidelines

### Input Validation

```typescript
// Good: Validate all inputs
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const validated = schema.parse(input);
```

### Authentication

```typescript
// Good: Proper middleware usage
app.use("/api/*", authMiddleware);
app.use("/admin/*", adminMiddleware);
```

---

## Testing Guidelines

### Test Structure

```typescript
// Good: Descriptive test names
describe("UserService", () => {
  test("should create user with valid data", async () => {
    const userData = { email: "test@example.com", name: "Test" };
    const user = await userService.createUser(userData);
    expect(user.email).toBe(userData.email);
  });
});
```

### Coverage Requirements

- **Lines**: 80% minimum
- **Functions**: 80% minimum
- **Branches**: 70% minimum

---

## Code Review Checklist

### Before Submitting PR

- [ ] Code follows naming conventions
- [ ] Functions are small and focused
- [ ] No `any` types used
- [ ] Error handling implemented
- [ ] Tests added for new features
- [ ] Documentation updated if needed
- [ ] No console.log statements in production code

### Review Process

- [ ] Functionality works as intended
- [ ] Code is readable and maintainable
- [ ] No security vulnerabilities
- [ ] Performance implications considered
- [ ] Tests are adequate

---

## Tools and Commands

### Development Commands

```bash
# Install dependencies
bun install

# Start development
bun dev

# Run tests
bun test

# Lint code
bun lint

# Format code
bun format

# Build for production
bun build
```

### Database Commands

```bash
cd packages/DB

# Generate migration
bun run db:generate

# Run migration
bun run db:migrate

# Open database studio
bun run db:studio
```

---

**Remember**: Consistency is key. When in doubt, follow existing patterns in the codebase and prioritize readability and maintainability.

For setup details, see [DEVELOPMENT_SETUP.md](DEVELOPMENT_SETUP.md).
