// rooms.js


export const rooms = [
  {
    id: 'corridor',
    modelPath: 'models/corridor.glb',
    defaultUp: [0, 1, 0],
    preRotation: 0,
    entrances: [
      {
        id: 'start',
        // Blender (-10, 16, 0)
        position: [10, 2, 16],
        forward: [0, 0, 1],   // faces +Y in Blender -> +Z in game
      },
      {
        id: 'end',
        // Blender (10, -16, 0)
        position: [-10, 2, -16],
        forward: [0, 0, -1],  // faces -Y in Blender -> -Z in game
      },
    ],
  },
  {
    id: 'bufferzone',
    modelPath: 'models/Bufferzone.glb',
    defaultUp: [0, 1, 0],
    preRotation: 0,
    entrances: [
      {
        id: 'start',
        // Backward entrance centre before rotation. After rotation this will
        // be transformed into the appropriate Z-aligned position.
        position: [6, 2, 2],
        forward: [0, 0, 1]
      },
      {
        id: 'end',
        // Forward entrance centre before rotation.
        position: [-6, 2, -2],
        forward: [0, 0, -1]
      }
    ]
  },
  {
    id: 'sroom',
    modelPath: 'models/sroom.glb',
    defaultUp: [0, 1, 0],
    preRotation: 0,
    entrances: [
      {
        id: 'start',
        // Blender back: (0, -6, 0) -> [0, 2, -6]
        position: [0, 2, 8],
        forward: [0, 0, 1], // door faces -Y in Blender -> -Z in game
      },
      {
        id: 'end',
        // Blender entrance: (0, 30, 0) -> [0, 2, 30]
        position: [0, 2, -32],
        forward: [0, 0, -1],  // door faces +Y in Blender -> +Z in game
      },
    ],
  },
  {
    id: 'scaryladyroom',
    modelPath: 'models/scaryladyroom.glb',
    defaultUp: [0, 1, 0],
    preRotation: 0,
    entrances: [
      {
        id: 'start',
        // Blender (-10, 16, 0)
        position: [10, 2, 16],
        forward: [0, 0, 1],   // faces +Y in Blender -> +Z in game
      },
      {
        id: 'end',
        // Blender (10, -16, 0)
        position: [-10, 2, -16],
        forward: [0, 0, -1],  // faces -Y in Blender -> -Z in game
      },
    ],
  },
  {
    id: 'scarygang',
    modelPath: 'models/scarygang.glb',
    defaultUp: [0, 1, 0],
    preRotation: 0,
    entrances: [
      {
        id: 'start',
        // Blender (-10, 16, 0)
        position: [10, 2, 16],
        forward: [0, 0, 1],   // faces +Y in Blender -> +Z in game
      },
      {
        id: 'end',
        // Blender (10, -16, 0)
        position: [-10, 2, -16],
        forward: [0, 0, -1],  // faces -Y in Blender -> -Z in game
      },
    ],
  },
  {
    id: 'fiendroom',
    modelPath: 'models/fiendroom.glb',
    defaultUp: [0, 1, 0],
    preRotation: 0,
    entrances: [
      {
        id: 'start',
        // Same as corridor/scary rooms
        position: [10, 2, 16],
        forward: [0, 0, 1],
      },
      {
        id: 'end',
        // Same as corridor/scary rooms
        position: [-10, 2, -16],
        forward: [0, 0, -1],
      },
    ],
  },
];