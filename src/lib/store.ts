import { prisma } from './db';

// ===== Types (re-exported for backward compatibility) =====

export type Source = {
  id: string;
  name: string;
  type: string;
  text: string;
};

export type DocumentChunk = {
  id: string;
  sourceId: string;
  text: string;
};

export type Artifact = {
  id: string;
  type: 'audio' | 'summary' | 'slides';
  label: string;
  sourceIds: string[];
  url?: string;
  content?: string;
  script?: string;
  timestamp: number;
};

// ===== Session Operations =====

export async function createSession(title?: string): Promise<string> {
  const session = await prisma.session.create({
    data: { title: title || 'New Chat' },
  });
  return session.id;
}

export async function listSessions() {
  return prisma.session.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });
}

export async function getSession(id: string) {
  return prisma.session.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      sources: { include: { chunks: true } },
      artifacts: { orderBy: { createdAt: 'desc' } },
      researchReports: { orderBy: { createdAt: 'desc' } },
    },
  });
}

export async function deleteSession(id: string) {
  return prisma.session.delete({ where: { id } });
}

export async function renameSession(id: string, title: string) {
  return prisma.session.update({
    where: { id },
    data: { title },
  });
}

export async function touchSession(id: string) {
  return prisma.session.update({
    where: { id },
    data: { updatedAt: new Date() },
  });
}

// ===== Message Operations =====

export async function addMessage(sessionId: string, role: string, content: string) {
  const msg = await prisma.message.create({
    data: { sessionId, role, content },
  });
  // Touch session to update order
  await touchSession(sessionId);
  return msg;
}

export async function getMessages(sessionId: string) {
  return prisma.message.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
  });
}

// ===== Source Operations =====

export async function addSourceAndChunks(
  sessionId: string,
  source: { id: string; name: string; type: string; text: string }
): Promise<{ source: Source; chunks: DocumentChunk[] }> {
  // Create source
  await prisma.source.create({
    data: {
      id: source.id,
      sessionId,
      name: source.name,
      type: source.type,
      text: source.text,
    },
  });

  // Basic semantic chunking
  const paragraphs = source.text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  let currentChunk = '';
  const chunks: DocumentChunk[] = [];

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length > 1000) {
      if (currentChunk.trim()) {
        chunks.push({
          id: crypto.randomUUID(),
          sourceId: source.id,
          text: currentChunk.trim(),
        });
      }
      currentChunk = paragraph + '\n\n';
    } else {
      currentChunk += paragraph + '\n\n';
    }
  }
  if (currentChunk.trim()) {
    chunks.push({
      id: crypto.randomUUID(),
      sourceId: source.id,
      text: currentChunk.trim(),
    });
  }

  // Bulk create chunks
  if (chunks.length > 0) {
    await prisma.documentChunk.createMany({
      data: chunks.map(c => ({
        id: c.id,
        sourceId: c.sourceId,
        text: c.text,
      })),
    });
  }

  await touchSession(sessionId);
  return { source, chunks };
}

export async function deleteSourceAndChunks(id: string) {
  // Cascade delete handles chunks
  await prisma.source.delete({ where: { id } });
}

export async function getSources(sessionId: string) {
  return prisma.source.findMany({
    where: { sessionId },
    select: { id: true, name: true, type: true, text: true },
  });
}

export async function getChunks(sessionId: string, sourceIds?: string[]) {
  const where: { sourceId?: { in: string[] }; source?: { sessionId: string } } = {};
  if (sourceIds && sourceIds.length > 0) {
    where.sourceId = { in: sourceIds };
  } else {
    where.source = { sessionId };
  }
  return prisma.documentChunk.findMany({ where });
}

// ===== Artifact Operations =====

export async function saveArtifact(sessionId: string, artifact: Artifact) {
  await prisma.artifact.upsert({
    where: { id: artifact.id },
    create: {
      id: artifact.id,
      sessionId,
      type: artifact.type,
      label: artifact.label,
      sourceIds: JSON.stringify(artifact.sourceIds),
      url: artifact.url || null,
      content: artifact.content || null,
      script: artifact.script || null,
    },
    update: {
      type: artifact.type,
      label: artifact.label,
      sourceIds: JSON.stringify(artifact.sourceIds),
      url: artifact.url || null,
      content: artifact.content || null,
      script: artifact.script || null,
    },
  });
  await touchSession(sessionId);
}

export async function getArtifacts(sessionId: string): Promise<Artifact[]> {
  const rows = await prisma.artifact.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r: { id: string; type: string; label: string; sourceIds: string; url: string | null; content: string | null; script: string | null; createdAt: Date }) => ({
    id: r.id,
    type: r.type as Artifact['type'],
    label: r.label,
    sourceIds: JSON.parse(r.sourceIds),
    url: r.url || undefined,
    content: r.content || undefined,
    script: r.script || undefined,
    timestamp: r.createdAt.getTime(),
  }));
}

// ===== Research Report Operations =====

export async function saveResearchReport(
  sessionId: string,
  report: { id: string; topic: string; content: string; papers: { title: string; url: string; snippet?: string }[] }
) {
  await prisma.researchReport.create({
    data: {
      id: report.id,
      sessionId,
      topic: report.topic,
      content: report.content,
      papersSummary: JSON.stringify(report.papers),
    },
  });
  await touchSession(sessionId);
}

export async function getResearchReports(sessionId: string) {
  const rows = await prisma.researchReport.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r: { id: string; topic: string; content: string; papersSummary: string; createdAt: Date }) => ({
    id: r.id,
    topic: r.topic,
    content: r.content,
    papers: JSON.parse(r.papersSummary),
    createdAt: r.createdAt,
  }));
}

// ===== Legacy compatibility: loadStore for retrieval.ts =====

export async function loadStoreForSession(sessionId: string) {
  const sources = await prisma.source.findMany({
    where: { sessionId },
    include: { chunks: true },
  });
  const chunks = sources.flatMap((s: { chunks: { id: string; sourceId: string; text: string }[] }) => s.chunks);
  const artifacts = await getArtifacts(sessionId);
  return {
    sources: sources.map((s: { id: string; name: string; type: string; text: string }) => ({ id: s.id, name: s.name, type: s.type, text: s.text })),
    chunks: chunks.map((c: { id: string; sourceId: string; text: string }) => ({ id: c.id, sourceId: c.sourceId, text: c.text })),
    artifacts,
  };
}
