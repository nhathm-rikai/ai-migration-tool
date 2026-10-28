// Wire payloads of the Projects API as shipped before C01. They are written
// as plain JSON, not derived from the schemas, so a breaking schema change
// fails the compatibility test instead of silently updating the fixture.

export const legacyCreateProjectRequest = {
  name: 'Order module',
  fixtureId: 'sample-vb6',
};

export const legacyProject = {
  id: '3f2b8c1e-5a4d-4e7f-9b6a-1c2d3e4f5a6b',
  name: 'Order module',
  fixtureId: 'sample-vb6',
  mode: 'demo',
  createdAt: '2026-10-15T08:30:00.000Z',
};

export const legacyProjectList = {
  items: [legacyProject],
  nextCursor: null,
};

export const legacyProjectListQuery = {
  limit: '20',
  cursor: '3f2b8c1e-5a4d-4e7f-9b6a-1c2d3e4f5a6b',
};

// Local source projects (PF05/B03): no fixture ID; the source comes from
// registration. Also plain JSON, so a schema change cannot rewrite them.
export const createLocalProjectRequest = {
  name: 'Order module (local)',
  mode: 'local',
};

export const localProject = {
  id: '6e5d4c3b-2a19-4f08-8e7d-6c5b4a392817',
  name: 'Order module (local)',
  mode: 'local',
  createdAt: '2026-10-27T08:30:00.000Z',
};
