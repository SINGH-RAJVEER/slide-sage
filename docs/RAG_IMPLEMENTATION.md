# RAG (Retrieval Augmented Generation) Implementation

This document describes the RAG implementation using pgvector for the Slide Sage Presentation Generator.

## Overview

The RAG system enhances the presentation generation and iteration process by:

1. **Storing historical context**: Embedding user searches, iteration prompts, and presentation content
2. **Intelligent retrieval**: Finding semantically similar previous contexts when a user iterates
3. **Context enrichment**: Including relevant previous contexts in LLM prompts to improve output quality
4. **Consistency maintenance**: Ensuring presentations remain consistent across iterations

## Architecture

### Components

#### 1. **RAGService** (`apps/APIs/src/services/rag.service.ts`)

Core service for embedding management with the following responsibilities:

- **Embedding Generation**: Uses OpenRouter to generate embeddings for text
- **Storage**: Persists embeddings to pgvector-enabled PostgreSQL
- **Retrieval**: Performs similarity searches using cosine distance
- **Context Building**: Converts retrieved embeddings into LLM-ready context strings

**Key Methods:**

```typescript
// Generate embeddings using OpenRouter
async generateEmbedding(text: string): Promise<EmbeddingResult>

// Store search queries as embeddings
async storeSearchEmbedding(userId: string, searchQuery: string): Promise<SearchEmbedding | null>

// Store presentation iterations as embeddings
async storePresentationEmbedding(
  presentationId: string,
  userId: string,
  iterationPrompt: string,
  slides: Slide[]
): Promise<PresentationEmbedding | null>

// Retrieve similar contexts for a query
async retrieveSimilarContexts(
  userId: string,
  presentationId: string,
  query: string,
  topK?: number,
  similarityThreshold?: number
): Promise<SimilarContext[]>

// Build formatted context string for LLM
async buildRagContextString(
  userId: string,
  presentationId: string,
  query: string
): Promise<string>

// Cleanup old embeddings
async cleanupOldEmbeddings(userId: string, daysToKeep?: number): Promise<number>
```

#### 2. **Database Schema**

Three new tables are created to support RAG:

**`search_embeddings`**

- Stores user search queries and their embeddings
- Indexed by user_id and embedding (HNSW index)
- Metadata includes query length and timestamp

**`presentation_embeddings`**

- Stores presentation iteration prompts and content embeddings
- Linked to presentations and users
- Metadata includes slide count and content length
- Indexed by presentation_id, user_id, and embedding (HNSW index)

**`rag_context`**

- Audit trail of retrieved contexts used in LLM prompts
- Tracks source type (search, iteration, presentation)
- Records similarity scores for analytics
- Indexed by presentation_id, user_id, and source_type

#### 3. **Integration Points**

**SearchService** (`apps/APIs/src/services/search.service.ts`)

- `storeSearchWithEmbedding()`: Stores search queries after web search

**PresentationService** (`apps/APIs/src/services/presentation.service.ts`)

- `storeIterationWithEmbedding()`: Stores iteration prompts and content
- `getRagContextForIteration()`: Retrieves RAG context for a specific query

**AIService** (`apps/APIs/src/services/ai.service.ts`)

- Enhanced `iteratePresentationStream()`: Includes RAG context in system prompts

**Presentation Routes** (`apps/APIs/src/routes/presentation.routes.ts`)

- `/generate-presentation-stream`: Stores initial topic as embedding
- `/iterate-presentation-stream`: Stores and uses iteration embeddings
- `/research-presentation`: Stores research queries as embeddings

## Data Flow

### Generation Flow

```
1. User creates presentation with topic
   └─> Topic stored as embedding in presentation_embeddings

2. Presentation saved to database

3. Future iterations reference this embedding
```

### Iteration Flow

```
1. User provides iteration feedback
   └─> Feedback query converted to embedding

2. RAG Service searches for similar contexts:
   ├─> Similar search queries from search_embeddings
   └─> Similar iterations from presentation_embeddings

3. Retrieved contexts formatted and prepended to LLM system prompt:
   "## RELEVANT PREVIOUS CONTEXTS:
    1. Previous Search (85% similarity): ..."

4. LLM generates improved presentation using context

5. New iteration stored as embedding for future reference
   └─> Also stored in rag_context table for audit trail
```

### Retrieval Flow

```
1. Query received for iteration
   └─> Generate embedding using OpenRouter

2. Search in search_embeddings table:
   - Use HNSW index for fast similarity search
   - Filter by user_id (privacy/isolation)
   - Apply similarity threshold (default 0.6)

3. Search in presentation_embeddings table:
   - Same HNSW index search
   - Filter by user_id AND presentation_id
   - Apply similarity threshold

4. Combine results and sort by similarity
   - Return top K results (default 5)

5. Store retrieved contexts in rag_context for audit trail
```

## Configuration

### Environment Variables

```bash
# OpenRouter Configuration
OPEN_ROUTER_API_KEY=your-openrouter-key

# Embedding Model Configuration
EMBEDDING_MODEL=google/gemini-embedding-001

# Database URL (existing configuration)
DATABASE_URL=postgresql://user:password@localhost:5432/slidesage
```

### Supported Embedding Models

The system uses OpenRouter to access embedding models. Supported models include:

| Model                       | Dimensions | Provider | Recommendation                           |
| --------------------------- | ---------- | -------- | ---------------------------------------- |
| `google/gemini-embedding-001` | 768      | Google   | Recommended default for current schema   |
| `qwen/qwen3-embedding-0.6b` | varies     | Qwen     | Alternative if configured for 768 dims   |
| `openai/text-embedding-3-small` | 1536   | OpenAI   | Alternative requiring schema migration   |

**Note:** The database schema stores 768-dimensional vectors. If you use a model
that returns a different dimension, run an appropriate database migration and
update the RAG service dimensions setting.

### Tunable Parameters

In `RAGService.retrieveSimilarContexts()`:

```typescript
topK = 5; // Number of contexts to retrieve
similarityThreshold = 0.6; // Minimum similarity (0-1)
```

Adjust based on your needs:

- **Higher topK**: More context, but potentially noisy
- **Higher threshold**: Only highly relevant contexts, but may miss useful info
- **Lower threshold**: More contexts, but may include irrelevant ones

## Performance Considerations

### Vector Index Strategy

HNSW (Hierarchical Navigable Small World) indexes are used for fast similarity search:

```sql
CREATE INDEX CONCURRENTLY search_embeddings_embedding_idx
ON search_embeddings USING hnsw (embedding vector_cosine_ops);
```

**Performance characteristics:**

- Index creation: ~50ms per 1000 vectors
- Search: ~1-5ms for top-5 retrieval
- Insert: ~0.5ms per embedding

### Storage Optimization

**Vector dimensions**: 768 (gemini/text-embedding-004)

- 4 bytes per dimension (float32)
- ~3 KB per embedding + metadata
- 1M embeddings ≈ 3 GB

### Scaling Recommendations

| Users | Estimated Embeddings | Storage | Recommended Actions                     |
| ----- | -------------------- | ------- | --------------------------------------- |
| 100   | 20K                  | 60 MB   | No special action                       |
| 1K    | 200K                 | 600 MB  | Set up cleanup job (30 days)            |
| 10K   | 2M                   | 6 GB    | Archive old embeddings, partition table |
| 100K  | 20M                  | 60 GB   | Implement sharding by user_id           |

## Usage Examples

### Basic Usage

```typescript
import { RAGService } from "./services/rag.service";
import { PresentationService } from "./services/presentation.service";

const ragService = new RAGService();
const presentationService = new PresentationService();

// Store a search
await ragService.storeSearchEmbedding(
  "user-123",
  "How to implement machine learning in Node.js",
);

// Store a presentation iteration
await ragService.storePresentationEmbedding(
  "pres-456",
  "user-123",
  "Make the content more technical",
  slides,
);

// Retrieve contexts
const contexts = await ragService.retrieveSimilarContexts(
  "user-123",
  "pres-456",
  "Make the presentation more engaging",
  5,
  0.6,
);

// Build RAG context for LLM
const ragContext = await ragService.buildRagContextString(
  "user-123",
  "pres-456",
  "Improve the design",
);
```

### Integration in Iteration Flow

```typescript
// This happens automatically in the iteration endpoint:
// 1. User sends iteration feedback
// 2. RAGService.buildRagContextString() retrieves similar contexts
// 3. Contexts prepended to LLM system prompt
// 4. LLM generates improved presentation
// 5. New iteration stored as embedding
```

## API Responses

When RAG is active, the iteration response includes:

```json
{
  "event": "research",
  "data": {
    "status": "generating",
    "rag_context_used": true,
    "context_sources": 3
  }
}
```

## Monitoring & Analytics

### Useful Queries

**Check embedding storage:**

```sql
SELECT
  'search_embeddings' as table_name,
  COUNT(*) as count,
  pg_size_pretty(pg_total_relation_size('search_embeddings')) as size
FROM search_embeddings
UNION ALL
SELECT
  'presentation_embeddings',
  COUNT(*),
  pg_size_pretty(pg_total_relation_size('presentation_embeddings'))
FROM presentation_embeddings;
```

**Analyze retrieval effectiveness:**

```sql
SELECT
  source_type,
  AVG(similarity_score) as avg_similarity,
  COUNT(*) as usage_count
FROM rag_context
GROUP BY source_type
ORDER BY usage_count DESC;
```

**Check user embedding statistics:**

```sql
SELECT
  user_id,
  COUNT(DISTINCT presentation_id) as presentations_iterated,
  COUNT(*) as total_embeddings,
  MAX(created_at) as last_updated
FROM presentation_embeddings
GROUP BY user_id
ORDER BY total_embeddings DESC
LIMIT 10;
```

## Limitations & Future Work

### Current Limitations

1. **Embedding Model**: Fixed to single model per deployment (no multi-model support)
2. **Multilingual**: Embeddings trained primarily on English
3. **Real-time updates**: Index updates are not real-time
4. **Cross-presentation**: Cannot retrieve context from other users' presentations

### Future Enhancements

- [ ] Fine-tuned embedding models specific to presentations
- [ ] Multi-language support
- [ ] Semantic caching for frequently used embeddings
- [ ] Cross-user similarity recommendations
- [ ] RAG effectiveness metrics dashboard
- [ ] Custom similarity thresholds per user
- [ ] Embedding versioning for model updates
- [ ] Async embedding storage with queue

## Troubleshooting

### Common Issues

**Issue**: "pgvector extension not found"

```sql
CREATE EXTENSION vector;
```

**Issue**: No contexts retrieved

- Check similarity_score values in rag_context table
- Lower the similarityThreshold parameter
- Ensure embeddings exist for the user

**Issue**: Slow similarity searches

- Run `VACUUM ANALYZE` on the embedding tables
- Check HNSW index is created
- Monitor index size growth

## References

- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [Groq API Documentation](https://console.groq.com/docs)
- [Embeddings Best Practices](https://platform.openai.com/docs/guides/embeddings)
