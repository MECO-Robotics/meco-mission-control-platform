import type { PlatformSnapshot } from "../domain/types";
import { INITIAL_WORK_TYPES } from "../domain/taskDisciplines";

// Restored from the pre-compaction development seed and mapped to the canonical FRC model.
export const snapshot: PlatformSnapshot = {
  "snapshotSchemaVersion": 1,
  "seasons": [
    {
      "id": "default-season",
      "name": "Tutorial Season",
      "type": "season",
      "startDate": "2026-01-06",
      "endDate": "2026-08-31"
    }
  ],
  "projects": [
    {
      "id": "project-robot-2026",
      "teamId": "meco-robotics",
      "seasonId": "default-season",
      "name": "Robot",
      "projectType": "robot",
      "description": "Sandbox robot workspace used for guided onboarding and practice flows.",
      "status": "active"
    },
    {
      "id": "project-media-2026",
      "teamId": "meco-robotics",
      "seasonId": "default-season",
      "name": "Media",
      "projectType": "media",
      "description": "Public-facing content, visual assets, and sponsor-ready media packages.",
      "status": "active"
    },
    {
      "id": "project-outreach-2026",
      "teamId": "meco-robotics",
      "seasonId": "default-season",
      "name": "Outreach",
      "projectType": "outreach",
      "description": "Community demos, STEM nights, and sponsor-facing engagement milestones.",
      "status": "planned"
    },
    {
      "id": "project-operations-2026",
      "teamId": "meco-robotics",
      "seasonId": "default-season",
      "name": "Operations",
      "projectType": "operations",
      "description": "Team logistics, documentation, travel, and milestone readiness.",
      "status": "active"
    },
    {
      "id": "project-strategy-2026",
      "teamId": "meco-robotics",
      "seasonId": "default-season",
      "name": "Strategy",
      "projectType": "strategy",
      "description": "Match analysis, competitive planning, and strategic decisions.",
      "status": "active"
    },
    {
      "id": "project-training-2026",
      "teamId": "meco-robotics",
      "seasonId": "default-season",
      "name": "Training",
      "projectType": "training",
      "description": "Scout onboarding, practice runs, and team training workflows.",
      "status": "active"
    }
  ],
  "workTypes": [
    {
      "id": "robot:design",
      "projectType": "robot",
      "code": "design",
      "name": "Design",
      "isActive": true
    },
    {
      "id": "robot:manufacturing",
      "projectType": "robot",
      "code": "manufacturing",
      "name": "Manufacturing",
      "isActive": true
    },
    {
      "id": "robot:assembly",
      "projectType": "robot",
      "code": "assembly",
      "name": "Assembly",
      "isActive": true
    },
    {
      "id": "robot:electrical-wiring",
      "projectType": "robot",
      "code": "electrical-wiring",
      "name": "Electrical/Wiring",
      "isActive": true
    },
    {
      "id": "robot:programming",
      "projectType": "robot",
      "code": "programming",
      "name": "Programming",
      "isActive": true
    },
    {
      "id": "robot:testing",
      "projectType": "robot",
      "code": "testing",
      "name": "Testing",
      "isActive": true
    },
    {
      "id": "robot:driving",
      "projectType": "robot",
      "code": "driving",
      "name": "Driving",
      "isActive": true
    },
    {
      "id": "robot:planning",
      "projectType": "robot",
      "code": "planning",
      "name": "Planning",
      "isActive": true
    },
    {
      "id": "media:photography",
      "projectType": "media",
      "code": "photography",
      "name": "Photography",
      "isActive": true
    },
    {
      "id": "media:video",
      "projectType": "media",
      "code": "video",
      "name": "Video",
      "isActive": true
    },
    {
      "id": "media:graphics",
      "projectType": "media",
      "code": "graphics",
      "name": "Graphics",
      "isActive": true
    },
    {
      "id": "media:writing",
      "projectType": "media",
      "code": "writing",
      "name": "Writing",
      "isActive": true
    },
    {
      "id": "media:web",
      "projectType": "media",
      "code": "web",
      "name": "Web",
      "isActive": true
    },
    {
      "id": "media:social-media",
      "projectType": "media",
      "code": "social-media",
      "name": "Social Media",
      "isActive": true
    },
    {
      "id": "outreach:engagement",
      "projectType": "outreach",
      "code": "engagement",
      "name": "Engagement",
      "isActive": true
    },
    {
      "id": "outreach:presentation",
      "projectType": "outreach",
      "code": "presentation",
      "name": "Presentation",
      "isActive": true
    },
    {
      "id": "outreach:documentation",
      "projectType": "outreach",
      "code": "documentation",
      "name": "Documentation",
      "isActive": true
    },
    {
      "id": "outreach:media-production",
      "projectType": "outreach",
      "code": "media-production",
      "name": "Media Production",
      "isActive": true
    },
    {
      "id": "outreach:partnerships",
      "projectType": "outreach",
      "code": "partnerships",
      "name": "Partnerships",
      "isActive": true
    },
    {
      "id": "operations:communications",
      "projectType": "operations",
      "code": "communications",
      "name": "Communications",
      "isActive": true
    },
    {
      "id": "operations:finance",
      "projectType": "operations",
      "code": "finance",
      "name": "Finance",
      "isActive": true
    },
    {
      "id": "operations:research",
      "projectType": "operations",
      "code": "research",
      "name": "Research",
      "isActive": true
    },
    {
      "id": "operations:documentation",
      "projectType": "operations",
      "code": "documentation",
      "name": "Documentation",
      "isActive": true
    },
    {
      "id": "operations:planning",
      "projectType": "operations",
      "code": "planning",
      "name": "Planning",
      "isActive": true
    },
    {
      "id": "strategy:game-analysis",
      "projectType": "strategy",
      "code": "game-analysis",
      "name": "Game Analysis",
      "isActive": true
    },
    {
      "id": "strategy:scouting",
      "projectType": "strategy",
      "code": "scouting",
      "name": "Scouting",
      "isActive": true
    },
    {
      "id": "strategy:data-analysis",
      "projectType": "strategy",
      "code": "data-analysis",
      "name": "Data Analysis",
      "isActive": true
    },
    {
      "id": "strategy:documentation",
      "projectType": "strategy",
      "code": "documentation",
      "name": "Documentation",
      "isActive": true
    },
    {
      "id": "strategy:risk-review",
      "projectType": "strategy",
      "code": "risk-review",
      "name": "Risk Review",
      "isActive": true
    },
    {
      "id": "training:curriculum",
      "projectType": "training",
      "code": "curriculum",
      "name": "Curriculum",
      "isActive": true
    },
    {
      "id": "training:instruction",
      "projectType": "training",
      "code": "instruction",
      "name": "Instruction",
      "isActive": true
    },
    {
      "id": "training:documentation",
      "projectType": "training",
      "code": "documentation",
      "name": "Documentation",
      "isActive": true
    },
    {
      "id": "training:practice",
      "projectType": "training",
      "code": "practice",
      "name": "Practice",
      "isActive": true
    },
    {
      "id": "training:assessment",
      "projectType": "training",
      "code": "assessment",
      "name": "Assessment",
      "isActive": true
    },
    {
      "id": "training:planning",
      "projectType": "training",
      "code": "planning",
      "name": "Planning",
      "isActive": true
    }
  ],
  "responsibleGroups": [{
    "id": "team-drivetrain",
    "seasonId": "default-season",
    "name": "Drivetrain",
    "projectIds": ["project-robot-2026"],
    "workTypeIds": [],
    "memberIds": ["ava"],
    "primaryMemberIds": ["ava"],
    "isArchived": false
  }],
  "workstreams": [
    {
      "id": "workstream-drive",
      "projectId": "project-robot-2026",
      "name": "Drivetrain",
      "description": "Chassis, steering, and drive power distribution.",
      "isArchived": false
    },
    {
      "id": "workstream-manipulator",
      "projectId": "project-robot-2026",
      "name": "Manipulator",
      "description": "Intake, handling, and game-piece release hardware.",
      "isArchived": false
    },
    {
      "id": "workstream-controls",
      "projectId": "project-robot-2026",
      "name": "Controls",
      "description": "Robot software, safety interlocks, and autonomous behavior.",
      "isArchived": false
    },
    {
      "id": "workstream-media-content",
      "projectId": "project-media-2026",
      "name": "Content",
      "description": "Photos, video, graphics, demo scripts, and public-facing media assets.",
      "isArchived": false
    },
    {
      "id": "workstream-operations-comms",
      "projectId": "project-operations-2026",
      "name": "Communications",
      "description": "Sponsor updates, presentation packages, and team-facing documents.",
      "isArchived": false
    },
    {
      "id": "workstream-operations-logistics",
      "projectId": "project-operations-2026",
      "name": "Logistics",
      "description": "Travel plans, pit setup standards, and equipment packing workflows.",
      "isArchived": false
    },
    {
      "id": "workstream-outreach-milestones",
      "projectId": "project-outreach-2026",
      "name": "Milestones",
      "description": "School demos, volunteer coordination, and showcase scheduling.",
      "isArchived": false
    },
    {
      "id": "workstream-outreach-content",
      "projectId": "project-outreach-2026",
      "name": "Content",
      "description": "Demo scripts, signage, handouts, and public-facing media assets.",
      "isArchived": false
    },
    {
      "id": "workstream-scouting-data",
      "projectId": "project-training-2026",
      "name": "Data Pipeline",
      "description": "Tablet intake, sync reliability, and downstream strategy reports.",
      "isArchived": false
    },
    {
      "id": "workstream-scouting-training",
      "projectId": "project-training-2026",
      "name": "Training",
      "description": "Scout onboarding, rubric clarity, and quality assurance drills.",
      "isArchived": false
    },
    {
      "id": "workstream-strategy-scouting",
      "projectId": "project-strategy-2026",
      "name": "Scouting Intel",
      "description": "Opponent tendencies, matchup scouting notes, and pick-list evidence.",
      "isArchived": false
    },
    {
      "id": "workstream-strategy-playbooks",
      "projectId": "project-strategy-2026",
      "name": "Playbooks",
      "description": "Scenario planning, alliance strategy cards, and drive-team readiness briefs.",
      "isArchived": false
    }
  ],
  "members": [
    {
      "id": "ava",
      "name": "Ava Chen",
      "email": "ava.chen@mecorobotics.org",
      "role": "student",
      "elevated": false,
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "plannedWeeklyAttendanceHours": 6,
      "plannedAttendanceDays": [
        "tuesday",
        "thursday"
      ],
      "plannedAttendanceNotes": "Available for drivetrain build work."
    },
    {
      "id": "lucas",
      "name": "Lucas Brooks",
      "email": "lucas.brooks@mecorobotics.org",
      "role": "student",
      "elevated": false,
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ]
    },
    {
      "id": "priya",
      "name": "Priya Patel",
      "email": "priya.patel@mecorobotics.org",
      "role": "lead",
      "elevated": true,
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ]
    },
    {
      "id": "ethan",
      "name": "Ethan Hall",
      "email": "ethan.hall@mecorobotics.org",
      "role": "student",
      "elevated": false,
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ]
    },
    {
      "id": "jordan",
      "name": "Jordan Lee",
      "email": "jordan.lee@mecorobotics.org",
      "role": "mentor",
      "elevated": false,
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ]
    },
    {
      "id": "riley",
      "name": "Riley Kim",
      "email": "riley.kim@mecorobotics.org",
      "role": "mentor",
      "elevated": false,
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ]
    },
    {
      "id": "maya",
      "name": "Maya Ortiz",
      "email": "maya.ortiz@mecorobotics.org",
      "role": "admin",
      "elevated": true,
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ]
    },
    {
      "id": "noah",
      "name": "Noah Martinez",
      "email": "noah.martinez@mecorobotics.org",
      "role": "student",
      "elevated": false,
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ]
    },
    {
      "id": "zoe",
      "name": "Zoe Park",
      "email": "zoe.park@mecorobotics.org",
      "role": "student",
      "elevated": false,
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ]
    },
    {
      "id": "ben",
      "name": "Ben Walker",
      "email": "ben.walker@mecorobotics.org",
      "role": "student",
      "elevated": false,
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ]
    },
    {
      "id": "sofia",
      "name": "Sofia Rivera",
      "email": "sofia.rivera@mecorobotics.org",
      "role": "lead",
      "elevated": true,
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ]
    },
    {
      "id": "marco",
      "name": "Marco Silva",
      "email": "marco.silva@mecorobotics.org",
      "role": "mentor",
      "elevated": false,
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ]
    },
    {
      "id": "lena",
      "name": "Lena Novak",
      "email": "lena.novak@mecorobotics.org",
      "role": "admin",
      "elevated": true,
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ]
    },
    {
      "id": "olivia",
      "name": "Olivia Grant",
      "email": "olivia.grant@mecorobotics.org",
      "role": "student",
      "elevated": false,
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ]
    },
    {
      "id": "demo-alex-morgan",
      "name": "Alex Morgan",
      "email": "demo.alex.morgan@example.com",
      "role": "lead",
      "elevated": false,
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "plannedWeeklyAttendanceHours": 8,
      "plannedAttendanceDays": [
        "tuesday",
        "thursday",
        "saturday"
      ],
      "plannedAttendanceNotes": "Available for CAD reviews and design work."
    },
    {
      "id": "demo-sam-rivera",
      "name": "Sam Rivera",
      "email": "demo.sam.rivera@example.com",
      "role": "student",
      "elevated": false,
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "plannedWeeklyAttendanceHours": 6,
      "plannedAttendanceDays": [
        "tuesday",
        "thursday"
      ],
      "plannedAttendanceNotes": "Available for machining and fabrication."
    },
    {
      "id": "demo-taylor-chen",
      "name": "Taylor Chen",
      "email": "demo.taylor.chen@example.com",
      "role": "student",
      "elevated": false,
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "plannedWeeklyAttendanceHours": 6,
      "plannedAttendanceDays": [
        "tuesday",
        "thursday"
      ],
      "plannedAttendanceNotes": "Available for assembly and mechanical integration."
    },
    {
      "id": "demo-jamie-patel",
      "name": "Jamie Patel",
      "email": "demo.jamie.patel@example.com",
      "role": "student",
      "elevated": false,
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "plannedWeeklyAttendanceHours": 8,
      "plannedAttendanceDays": [
        "tuesday",
        "thursday",
        "saturday"
      ],
      "plannedAttendanceNotes": "Available for wiring and electrical testing."
    },
    {
      "id": "demo-casey-brooks",
      "name": "Casey Brooks",
      "email": "demo.casey.brooks@example.com",
      "role": "lead",
      "elevated": false,
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "plannedWeeklyAttendanceHours": 10,
      "plannedAttendanceDays": [
        "tuesday",
        "thursday",
        "saturday"
      ],
      "plannedAttendanceNotes": "Available for software development and code reviews."
    },
    {
      "id": "demo-quinn-parker",
      "name": "Quinn Parker",
      "email": "demo.quinn.parker@example.com",
      "role": "student",
      "elevated": false,
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "plannedWeeklyAttendanceHours": 6,
      "plannedAttendanceDays": [
        "tuesday",
        "thursday"
      ],
      "plannedAttendanceNotes": "Available for test runs and documenting results."
    },
    {
      "id": "demo-riley-dawson",
      "name": "Riley Dawson",
      "email": "demo.riley.dawson@example.com",
      "role": "student",
      "elevated": false,
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "plannedWeeklyAttendanceHours": 4,
      "plannedAttendanceDays": [
        "tuesday",
        "thursday"
      ],
      "plannedAttendanceNotes": "Available for outreach and team communications."
    },
    {
      "id": "demo-jordan-ellis",
      "name": "Jordan Ellis",
      "email": "demo.jordan.ellis@example.com",
      "role": "student",
      "elevated": false,
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "plannedWeeklyAttendanceHours": 4,
      "plannedAttendanceDays": [
        "tuesday",
        "thursday"
      ],
      "plannedAttendanceNotes": "Available for scheduling and project planning."
    }
  ],
  "subsystems": [
    {
      "id": "drive",
      "projectId": "project-robot-2026",
      "name": "Drivetrain",
      "description": "Core drivetrain, chassis interfaces, and shared base electronics.",
      "isCore": true,
      "parentSubsystemId": null,
      "responsibleEngineerId": "ava",
      "mentorIds": [
        "marco"
      ],
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "manipulator",
      "projectId": "project-robot-2026",
      "name": "Manipulator",
      "description": "Game-piece intake, handling, and release hardware.",
      "isCore": false,
      "parentSubsystemId": "drive",
      "responsibleEngineerId": "lucas",
      "mentorIds": [
        "riley"
      ],
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "controls",
      "projectId": "project-robot-2026",
      "name": "Controls",
      "description": "Robot software, automation logic, and safety behaviors.",
      "isCore": false,
      "parentSubsystemId": "drive",
      "responsibleEngineerId": "ethan",
      "mentorIds": [
        "riley"
      ],
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "vision",
      "projectId": "project-robot-2026",
      "name": "Vision",
      "description": "Camera stack, localization tuning, and driver feedback overlays.",
      "isCore": false,
      "parentSubsystemId": "drive",
      "responsibleEngineerId": "ethan",
      "mentorIds": [
        "riley"
      ],
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "climber",
      "projectId": "project-robot-2026",
      "name": "Climber",
      "description": "Endgame climb hardware and safety interlock integration.",
      "isCore": false,
      "parentSubsystemId": "drive",
      "responsibleEngineerId": "ben",
      "mentorIds": [
        "jordan"
      ],
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "operations",
      "projectId": "project-operations-2026",
      "name": "Operations",
      "description": "Pit process, logistics, and team documentation workflows.",
      "isCore": true,
      "parentSubsystemId": null,
      "responsibleEngineerId": "sofia",
      "mentorIds": [
        "marco"
      ],
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "pit-readiness",
      "projectId": "project-operations-2026",
      "name": "Pit Readiness",
      "description": "Pre-milestone readiness checklist, spare bins, and deployment consistency.",
      "isCore": false,
      "parentSubsystemId": "operations",
      "responsibleEngineerId": "noah",
      "mentorIds": [
        "marco"
      ],
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "outreach",
      "projectId": "project-outreach-2026",
      "name": "Outreach",
      "description": "Demo experiences, volunteer staffing, and public-facing materials.",
      "isCore": true,
      "parentSubsystemId": null,
      "responsibleEngineerId": "zoe",
      "mentorIds": [
        "marco"
      ],
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "media-production",
      "projectId": "project-media-2026",
      "name": "Media Production",
      "description": "Photo/video capture, story editing, and sponsor-ready media delivery.",
      "isCore": true,
      "parentSubsystemId": null,
      "responsibleEngineerId": "zoe",
      "mentorIds": [
        "marco"
      ],
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "strategy",
      "projectId": "project-strategy-2026",
      "name": "Strategy",
      "description": "Opponent analysis, matchup planning, and alliance decision support.",
      "isCore": true,
      "parentSubsystemId": null,
      "responsibleEngineerId": "noah",
      "mentorIds": [
        "riley"
      ],
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "scouting",
      "projectId": "project-training-2026",
      "name": "Scouting",
      "description": "Match data collection and strategy insights pipeline.",
      "isCore": true,
      "parentSubsystemId": null,
      "responsibleEngineerId": "noah",
      "mentorIds": [
        "riley"
      ],
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "shared-fabrication",
      "projectId": "project-robot-2026",
      "name": "Shared Fabrication",
      "description": "Robot-project fabrication support for shared team hardware and demo equipment.",
      "isCore": false,
      "parentSubsystemId": null,
      "responsibleEngineerId": null,
      "mentorIds": [
        "marco"
      ],
      "iteration": 1,
      "isArchived": false
    }
  ],
  "mechanisms": [
    {
      "id": "left-front-module",
      "subsystemId": "drive",
      "name": "Left Front Module",
      "description": "Swerve drive and steering assembly for the front-left corner.",
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "right-front-module",
      "subsystemId": "drive",
      "name": "Right Front Module",
      "description": "Swerve drive and steering assembly for the front-right corner.",
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "left-back-module",
      "subsystemId": "drive",
      "name": "Left Back Module",
      "description": "Swerve drive and steering assembly for the rear-left corner.",
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "right-back-module",
      "subsystemId": "drive",
      "name": "Right Back Module",
      "description": "Swerve drive and steering assembly for the rear-right corner.",
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "chassis",
      "subsystemId": "drive",
      "name": "Chassis",
      "description": "Primary frame rails and structural mounting interfaces.",
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "swerve-module",
      "subsystemId": "drive",
      "name": "Swerve Module",
      "description": "Steering and drive hardware that controls wheel motion.",
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "intake-roller",
      "subsystemId": "manipulator",
      "name": "Intake Roller",
      "description": "Primary intake path for acquiring and centering game pieces.",
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "power-distribution",
      "subsystemId": "drive",
      "name": "Power Distribution",
      "description": "Main power routing, breaker labeling, and documentation area.",
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "auto-safety",
      "subsystemId": "controls",
      "name": "Auto Safety",
      "description": "Autonomous path execution, abort handling, and safety bounds.",
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "limelight-mount",
      "subsystemId": "vision",
      "name": "Limelight Mount",
      "description": "Rigid camera mount, service access, and cable retention routing.",
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "climb-winch",
      "subsystemId": "climber",
      "name": "Climb Winch",
      "description": "Winch drum, ratchet, and sensor bundle for endgame climbing.",
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "pit-board",
      "subsystemId": "pit-readiness",
      "name": "Pit Board",
      "description": "Visual job board for pit queue ownership and turnaround timing.",
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "demo-kiosk",
      "subsystemId": "outreach",
      "name": "Demo Kiosk",
      "description": "Portable showcase kiosk with looped media and sponsor highlights.",
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "tablet-sync",
      "subsystemId": "scouting",
      "name": "Tablet Sync",
      "description": "Scouting tablet provisioning and data synchronization stack.",
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "highlights-pipeline",
      "subsystemId": "media-production",
      "name": "Highlights Pipeline",
      "description": "Capture, edit, and publish flow for reveal clips and recap packages.",
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "alliance-modeling",
      "subsystemId": "strategy",
      "name": "Alliance Modeling",
      "description": "Opponent trend scoring and matchup decision support workflow.",
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "team-prototype-shop",
      "subsystemId": "shared-fabrication",
      "name": "Team Prototype Shop",
      "description": "Shared fabrication workbench for team prototype jobs.",
      "iteration": 1,
      "isArchived": false
    }
  ],
  "materials": [
    {
      "id": "mat-1-8-polycarbonate",
      "name": "1/8 Polycarbonate Sheet",
      "category": "plastic",
      "unit": "sheet",
      "onHandQuantity": 2,
      "reorderPoint": 3,
      "location": "Shelf B2",
      "preferredVendorId": "vendor-demo-1",
      "notes": "Used for intake guards and light-duty prototyping."
    },
    {
      "id": "mat-onyx-filament",
      "name": "Onyx Filament",
      "category": "filament",
      "unit": "spool",
      "onHandQuantity": 1,
      "reorderPoint": 2,
      "location": "Filament cabinet",
      "preferredVendorId": "vendor-demo-2",
      "notes": "Reserve spool for drivetrain and load-bearing prints."
    },
    {
      "id": "mat-m3-hardware",
      "name": "M3 Hardware Kit",
      "category": "hardware",
      "unit": "kit",
      "onHandQuantity": 6,
      "reorderPoint": 4,
      "location": "Hardware drawers",
      "preferredVendorId": "vendor-demo-3",
      "notes": "Mixed nuts, bolts, washers, and spacers."
    },
    {
      "id": "mat-ferrules",
      "name": "Ferrule Refill Kit",
      "category": "electronics",
      "unit": "kit",
      "onHandQuantity": 0,
      "reorderPoint": 1,
      "location": "Wiring bench",
      "preferredVendorId": "vendor-demo-4",
      "notes": "Matches the drivetrain crimping station."
    },
    {
      "id": "mat-12awg-wire",
      "name": "12 AWG Wire",
      "category": "consumable",
      "unit": "ft",
      "onHandQuantity": 84,
      "reorderPoint": 50,
      "location": "Wire rack",
      "preferredVendorId": "vendor-demo-5",
      "notes": "Red and black stock for power distribution runs."
    },
    {
      "id": "mat-6061-angle",
      "name": "6061 Aluminum Angle",
      "category": "metal",
      "unit": "ft",
      "onHandQuantity": 14,
      "reorderPoint": 8,
      "location": "Metal rack A1",
      "preferredVendorId": "vendor-demo-5",
      "notes": "Used for vision mounts and pit fixture brackets."
    },
    {
      "id": "mat-anderson-pack",
      "name": "Anderson Connector Pack",
      "category": "electronics",
      "unit": "pack",
      "onHandQuantity": 3,
      "reorderPoint": 2,
      "location": "Electrical shelf",
      "preferredVendorId": "vendor-demo-6",
      "notes": "Power connector replacements for pit service and battery accessories."
    },
    {
      "id": "mat-vinyl-banner",
      "name": "Vinyl Banner Roll",
      "category": "other",
      "unit": "roll",
      "onHandQuantity": 2,
      "reorderPoint": 1,
      "location": "Outreach cabinet",
      "preferredVendorId": "vendor-demo-7",
      "notes": "Sponsor signage and milestone booth headers."
    },
    {
      "id": "mat-cat6-cable",
      "name": "CAT6 Cable Spool",
      "category": "electronics",
      "unit": "ft",
      "onHandQuantity": 220,
      "reorderPoint": 80,
      "location": "Network bin",
      "preferredVendorId": "vendor-demo-8",
      "notes": "Scouting and pit-network cable runs."
    },
    {
      "id": "mat-zip-tie-kit",
      "name": "Zip Tie Assortment",
      "category": "consumable",
      "unit": "box",
      "onHandQuantity": 5,
      "reorderPoint": 2,
      "location": "Pit consumables",
      "preferredVendorId": "vendor-demo-1",
      "notes": "Cable management for field repair and quick routing."
    }
  ],
  "vendors": [
    {
      "id": "vendor-demo-1",
      "name": "McMaster-Carr",
      "website": null,
      "isArchived": false
    },
    {
      "id": "vendor-demo-2",
      "name": "Markforged",
      "website": null,
      "isArchived": false
    },
    {
      "id": "vendor-demo-3",
      "name": "Grainger",
      "website": null,
      "isArchived": false
    },
    {
      "id": "vendor-demo-4",
      "name": "AutomationDirect",
      "website": null,
      "isArchived": false
    },
    {
      "id": "vendor-demo-5",
      "name": "Online Metals",
      "website": null,
      "isArchived": false
    },
    {
      "id": "vendor-demo-6",
      "name": "AndyMark",
      "website": null,
      "isArchived": false
    },
    {
      "id": "vendor-demo-7",
      "name": "Uline",
      "website": null,
      "isArchived": false
    },
    {
      "id": "vendor-demo-8",
      "name": "Monoprice",
      "website": null,
      "isArchived": false
    },
    {
      "id": "vendor-demo-9",
      "name": "McMaster",
      "website": null,
      "isArchived": false
    },
    {
      "id": "vendor-demo-10",
      "name": "REV Robotics",
      "website": null,
      "isArchived": false
    },
    {
      "id": "vendor-demo-11",
      "name": "West Coast Products",
      "website": null,
      "isArchived": false
    },
    {
      "id": "vendor-demo-12",
      "name": "Local Print Shop",
      "website": null,
      "isArchived": false
    },
    {
      "id": "vendor-demo-13",
      "name": "Anker",
      "website": null,
      "isArchived": false
    },
    {
      "id": "vendor-demo-14",
      "name": "B&H",
      "website": null,
      "isArchived": false
    }
  ],
  "artifacts": [
    {
      "id": "artifact-sponsor-recap-apr",
      "projectId": "project-operations-2026",
      "targetRefs": [
        {
          "kind": "workstream",
          "id": "workstream-operations-comms"
        }
      ],
      "kind": "other",
      "title": "April Sponsor Recap",
      "summary": "Monthly sponsor-facing recap deck with team progress and outreach highlights.",
      "status": "published",
      "uri": "https://example.org/meco/sponsor-recap-apr-2026",
      "updatedAt": "2026-04-20T18:00:00-04:00"
    },
    {
      "id": "artifact-milestone-volunteer-guide",
      "projectId": "project-operations-2026",
      "targetRefs": [
        {
          "kind": "workstream",
          "id": "workstream-operations-comms"
        }
      ],
      "kind": "document",
      "title": "Milestone Volunteer Guide",
      "summary": "Operations checklist and volunteer assignments for outreach milestones.",
      "status": "in-review",
      "uri": "https://example.org/meco/milestone-volunteer-guide",
      "updatedAt": "2026-04-22T19:30:00-04:00"
    },
    {
      "id": "artifact-pit-checklist-v3",
      "projectId": "project-operations-2026",
      "targetRefs": [
        {
          "kind": "workstream",
          "id": "workstream-operations-logistics"
        }
      ],
      "kind": "document",
      "title": "Pit Checklist v3",
      "summary": "Revised pit setup, inspection prep, and emergency swap process checklist.",
      "status": "published",
      "uri": "https://example.org/meco/pit-checklist-v3",
      "updatedAt": "2026-04-24T20:15:00-04:00"
    },
    {
      "id": "artifact-travel-pack-template",
      "projectId": "project-operations-2026",
      "targetRefs": [
        {
          "kind": "workstream",
          "id": "workstream-operations-logistics"
        }
      ],
      "kind": "document",
      "title": "Travel Pack Template",
      "summary": "Template pack for travel roster, tool manifest, and venue readiness documents.",
      "status": "draft",
      "uri": "https://example.org/meco/travel-pack-template",
      "updatedAt": "2026-04-25T18:10:00-04:00"
    },
    {
      "id": "artifact-stem-night-run-of-show",
      "projectId": "project-outreach-2026",
      "targetRefs": [
        {
          "kind": "workstream",
          "id": "workstream-outreach-milestones"
        }
      ],
      "kind": "document",
      "title": "STEM Night Run of Show",
      "summary": "Minute-by-minute plan for volunteer coverage and demo rotations.",
      "status": "in-review",
      "uri": "https://example.org/meco/stem-night-run-of-show",
      "updatedAt": "2026-04-26T21:00:00-04:00"
    },
    {
      "id": "artifact-demo-script-v2",
      "projectId": "project-media-2026",
      "targetRefs": [
        {
          "kind": "workstream",
          "id": "workstream-media-content"
        }
      ],
      "kind": "other",
      "title": "Demo Script v2",
      "summary": "Public-facing script for robot showcase with safety and sponsor callouts.",
      "status": "published",
      "uri": "https://example.org/meco/demo-script-v2",
      "updatedAt": "2026-04-26T19:20:00-04:00"
    },
    {
      "id": "artifact-media-shot-list-v3",
      "projectId": "project-media-2026",
      "targetRefs": [
        {
          "kind": "workstream",
          "id": "workstream-media-content"
        }
      ],
      "kind": "document",
      "title": "Media Shot List v3",
      "summary": "Robot reveal and pit-action shot list with owner assignments and timing windows.",
      "status": "in-review",
      "uri": "https://example.org/meco/media-shot-list-v3",
      "updatedAt": "2026-05-03T19:15:00-04:00"
    },
    {
      "id": "artifact-scouting-rubric",
      "projectId": "project-training-2026",
      "targetRefs": [
        {
          "kind": "workstream",
          "id": "workstream-scouting-training"
        }
      ],
      "kind": "document",
      "title": "Scouting Rubric",
      "summary": "Unified milestone rubric with examples to improve consistency across scouts.",
      "status": "published",
      "uri": "https://example.org/meco/scouting-rubric",
      "updatedAt": "2026-04-27T17:35:00-04:00"
    },
    {
      "id": "artifact-scouting-ingest-notes",
      "projectId": "project-training-2026",
      "targetRefs": [
        {
          "kind": "workstream",
          "id": "workstream-scouting-data"
        }
      ],
      "kind": "document",
      "title": "Scouting Ingest Reliability Notes",
      "summary": "Known sync retry behavior and mitigation checklist for milestone Wi-Fi constraints.",
      "status": "in-review",
      "uri": "https://example.org/meco/scouting-ingest-notes",
      "updatedAt": "2026-04-27T20:45:00-04:00"
    },
    {
      "id": "artifact-strategy-picklist-board",
      "projectId": "project-strategy-2026",
      "targetRefs": [
        {
          "kind": "workstream",
          "id": "workstream-strategy-scouting"
        }
      ],
      "kind": "document",
      "title": "Strategy Picklist Board",
      "summary": "Ranked alliance notes with constraint tags and weekend matchup priorities.",
      "status": "draft",
      "uri": "https://example.org/meco/strategy-picklist-board",
      "updatedAt": "2026-05-04T20:10:00-04:00"
    }
  ],
  "partDefinitions": [
    {
      "id": "pd-swerve-encoder-bracket",
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "name": "Swerve Encoder Bracket",
      "partNumber": "DRV-101",
      "revision": "B",
      "iteration": 1,
      "isArchived": false,
      "type": "custom",
      "defaultAcquisitionMethod": "manufacture",
      "materialId": "mat-onyx-filament",
      "description": "Printed bracket for the front-left and mirrored swerve encoder mounts.",
      "cadSource": "manual",
      "cadImportSource": "MANUAL"
    },
    {
      "id": "pd-intake-guard",
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "name": "Intake Guard Plate",
      "partNumber": "MAN-214",
      "revision": "C",
      "iteration": 1,
      "isArchived": false,
      "type": "custom",
      "defaultAcquisitionMethod": "manufacture",
      "materialId": "mat-1-8-polycarbonate",
      "description": "Cut guard plate that protects the intake path and maintains pulley clearance.",
      "cadSource": "manual",
      "cadImportSource": "MANUAL"
    },
    {
      "id": "pd-pdh-label-sheet",
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "name": "PDH Label Set",
      "partNumber": "ELE-052",
      "revision": "A",
      "iteration": 1,
      "isArchived": false,
      "type": "custom",
      "defaultAcquisitionMethod": "manufacture",
      "materialId": null,
      "description": "Printable breaker and wiring labeling sheet for the drivetrain.",
      "cadSource": "manual",
      "cadImportSource": "MANUAL"
    },
    {
      "id": "pd-polycarbonate-sheet",
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "name": "Polycarbonate Sheet",
      "partNumber": "MAT-101",
      "revision": "A",
      "iteration": 1,
      "isArchived": false,
      "type": "stock",
      "defaultAcquisitionMethod": "manufacture",
      "materialId": "mat-1-8-polycarbonate",
      "description": "Stock sheet used for guards, panels, and fabrication prototypes.",
      "cadSource": "manual",
      "cadImportSource": "MANUAL"
    },
    {
      "id": "pd-ferrule-refill-kit",
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "name": "Ferrule Refill Kit",
      "partNumber": "ELE-120",
      "revision": "A",
      "iteration": 1,
      "isArchived": false,
      "type": "kit",
      "defaultAcquisitionMethod": "manufacture",
      "materialId": "mat-ferrules",
      "description": "Ferrule refill stock for drivetrain wire termination work.",
      "cadSource": "manual",
      "cadImportSource": "MANUAL"
    },
    {
      "id": "pd-sprocket-service-pack",
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "name": "Sprocket Service Pack",
      "partNumber": "DRV-220",
      "revision": "A",
      "iteration": 1,
      "isArchived": false,
      "type": "service kit",
      "defaultAcquisitionMethod": "manufacture",
      "materialId": "mat-m3-hardware",
      "description": "Hardware and replacement pieces used for drive service work.",
      "cadSource": "manual",
      "cadImportSource": "MANUAL"
    },
    {
      "id": "pd-limelight-mount-plate",
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "name": "Limelight Mount Plate",
      "partNumber": "VIS-110",
      "revision": "B",
      "iteration": 1,
      "isArchived": false,
      "type": "custom",
      "defaultAcquisitionMethod": "manufacture",
      "materialId": "mat-6061-angle",
      "description": "Machined plate and standoff geometry for primary vision camera mounting.",
      "cadSource": "manual",
      "cadImportSource": "MANUAL"
    },
    {
      "id": "pd-climb-winch-spacer",
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "name": "Climb Winch Spacer",
      "partNumber": "CLM-044",
      "revision": "A",
      "iteration": 1,
      "isArchived": false,
      "type": "custom",
      "defaultAcquisitionMethod": "manufacture",
      "materialId": "mat-onyx-filament",
      "description": "Printed spacer set for winch alignment and bearing support.",
      "cadSource": "manual",
      "cadImportSource": "MANUAL"
    },
    {
      "id": "pd-pit-board-frame",
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "name": "Pit Board Frame",
      "partNumber": "OPS-212",
      "revision": "A",
      "iteration": 1,
      "isArchived": false,
      "type": "custom",
      "defaultAcquisitionMethod": "manufacture",
      "materialId": "mat-6061-angle",
      "description": "Aluminum frame kit for pit board and queue status display.",
      "cadSource": "manual",
      "cadImportSource": "MANUAL"
    },
    {
      "id": "pd-demo-kiosk-signage",
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "name": "Demo Kiosk Signage Kit",
      "partNumber": "OUT-017",
      "revision": "A",
      "iteration": 1,
      "isArchived": false,
      "type": "custom",
      "defaultAcquisitionMethod": "manufacture",
      "materialId": "mat-vinyl-banner",
      "description": "Printed signage set used on outreach kiosk and sponsor callout panels.",
      "cadSource": "manual",
      "cadImportSource": "MANUAL"
    },
    {
      "id": "pd-tablet-mount-bracket",
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "name": "Tablet Mount Bracket",
      "partNumber": "SCT-031",
      "revision": "A",
      "iteration": 1,
      "isArchived": false,
      "type": "custom",
      "defaultAcquisitionMethod": "manufacture",
      "materialId": "mat-1-8-polycarbonate",
      "description": "Laser-cut tablet mount and retention bracket for scouting stations.",
      "cadSource": "manual",
      "cadImportSource": "MANUAL"
    },
    {
      "id": "pd-camera-rig-plate",
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "name": "Camera Rig Plate",
      "partNumber": "MED-044",
      "revision": "A",
      "iteration": 1,
      "isArchived": false,
      "type": "custom",
      "defaultAcquisitionMethod": "manufacture",
      "materialId": "mat-6061-angle",
      "description": "Machined plate that stiffens the reveal camera rig and keeps framing stable.",
      "cadSource": "manual",
      "cadImportSource": "MANUAL"
    },
    {
      "id": "pd-anderson-service-pack",
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "name": "Anderson Service Pack",
      "partNumber": "ELE-190",
      "revision": "A",
      "iteration": 1,
      "isArchived": false,
      "type": "kit",
      "defaultAcquisitionMethod": "manufacture",
      "materialId": "mat-anderson-pack",
      "description": "Connector service stock for pit swaps and field emergency repair.",
      "cadSource": "manual",
      "cadImportSource": "MANUAL"
    },
    {
      "id": "pd-swerve-bracket-cnc",
      "name": "Swerve Bracket CNC Variant",
      "partNumber": "DRV-101-CNC",
      "revision": "A",
      "type": "custom",
      "defaultAcquisitionMethod": "manufacture",
      "materialId": "mat-1-8-polycarbonate",
      "description": "Tutorial CNC-cut polycarbonate variant.",
      "cadSource": "manual",
      "cadImportSource": "MANUAL",
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "pd-step-demo",
      "name": "STEP Provenance Example",
      "partNumber": "TUT-STEP",
      "revision": "A",
      "type": "custom",
      "defaultAcquisitionMethod": "stock",
      "materialId": null,
      "description": "Imported through STEP upload.",
      "cadSource": "step",
      "cadImportSource": "STEP_UPLOAD",
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "pd-onshape-demo",
      "name": "Onshape Provenance Example",
      "partNumber": "TUT-OSH",
      "revision": "A",
      "type": "custom",
      "defaultAcquisitionMethod": "stock",
      "materialId": null,
      "description": "Imported through the Onshape API.",
      "cadSource": "onshape",
      "cadImportSource": "ONSHAPE_API",
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "pd-onshape-bom-demo",
      "name": "Onshape BOM Provenance Example",
      "partNumber": "TUT-OBOM",
      "revision": "A",
      "type": "custom",
      "defaultAcquisitionMethod": "stock",
      "materialId": null,
      "description": "Imported through an Onshape BOM CSV.",
      "cadSource": "onshape",
      "cadImportSource": "ONSHAPE_BOM_CSV",
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "iteration": 1,
      "isArchived": false
    },
    {
      "id": "pd-manual-bom-demo",
      "name": "Manual BOM Provenance Example",
      "partNumber": "TUT-MBOM",
      "revision": "A",
      "type": "custom",
      "defaultAcquisitionMethod": "stock",
      "materialId": null,
      "description": "Imported through a manual BOM CSV.",
      "cadSource": "manual",
      "cadImportSource": "MANUAL_BOM_CSV",
      "seasonId": "default-season",
      "activeSeasonIds": [
        "default-season"
      ],
      "iteration": 1,
      "isArchived": false
    }
  ],
  "partInstances": [
    {
      "id": "pi-swerve-encoder-bracket-front-left",
      "partDefinitionId": "pd-swerve-encoder-bracket",
      "intendedSubsystemId": "drive",
      "intendedMechanismId": "swerve-module",
      "location": {
        "kind": "installed",
        "subsystemId": "drive",
        "mechanismId": "swerve-module"
      }
    },
    {
      "id": "pi-intake-guard-set",
      "partDefinitionId": "pd-intake-guard",
      "intendedSubsystemId": "manipulator",
      "intendedMechanismId": "intake-roller",
      "location": {
        "kind": "installed",
        "subsystemId": "manipulator",
        "mechanismId": "intake-roller"
      }
    },
    {
      "id": "pi-pdh-label-set",
      "partDefinitionId": "pd-pdh-label-sheet",
      "intendedSubsystemId": "drive",
      "intendedMechanismId": "power-distribution",
      "location": {
        "kind": "installed",
        "subsystemId": "drive",
        "mechanismId": "power-distribution"
      }
    },
    {
      "id": "pi-limelight-mount",
      "partDefinitionId": "pd-limelight-mount-plate",
      "intendedSubsystemId": "vision",
      "intendedMechanismId": "limelight-mount",
      "location": {
        "kind": "installed",
        "subsystemId": "vision",
        "mechanismId": "limelight-mount"
      }
    },
    {
      "id": "pi-climb-winch-spacer-set",
      "partDefinitionId": "pd-climb-winch-spacer",
      "intendedSubsystemId": "climber",
      "intendedMechanismId": "climb-winch",
      "location": {
        "kind": "installed",
        "subsystemId": "climber",
        "mechanismId": "climb-winch"
      }
    },
    {
      "id": "pi-pit-board-frame",
      "partDefinitionId": "pd-pit-board-frame",
      "intendedSubsystemId": "pit-readiness",
      "intendedMechanismId": "pit-board",
      "location": {
        "kind": "installed",
        "subsystemId": "pit-readiness",
        "mechanismId": "pit-board"
      }
    },
    {
      "id": "pi-demo-kiosk-signage",
      "partDefinitionId": "pd-demo-kiosk-signage",
      "intendedSubsystemId": "outreach",
      "intendedMechanismId": "demo-kiosk",
      "location": {
        "kind": "installed",
        "subsystemId": "outreach",
        "mechanismId": "demo-kiosk"
      }
    },
    {
      "id": "pi-tablet-mount-brackets",
      "partDefinitionId": "pd-tablet-mount-bracket",
      "intendedSubsystemId": "scouting",
      "intendedMechanismId": "tablet-sync",
      "location": {
        "kind": "installed",
        "subsystemId": "scouting",
        "mechanismId": "tablet-sync"
      }
    },
    {
      "id": "pi-camera-rig-plate",
      "partDefinitionId": "pd-camera-rig-plate",
      "intendedSubsystemId": "media-production",
      "intendedMechanismId": "highlights-pipeline",
      "location": {
        "kind": "installed",
        "subsystemId": "media-production",
        "mechanismId": "highlights-pipeline"
      }
    }
  ],
  "tasks": [
    {
      "id": "swerve-sensor-bundle",
      "projectId": "project-robot-2026",
      "workstreamIds": [
        "workstream-drive"
      ],
      "title": "Swerve sensor bundle verification",
      "summary": "Finish steering encoder verification and notebook evidence.",
      "subsystemIds": [
        "drive"
      ],
      "mechanismIds": [
        "swerve-module"
      ],
      "partInstanceIds": [
        "pi-swerve-encoder-bracket-front-left"
      ],
      "ownerId": "ava",
      "mentorId": "marco",
      "startDate": "2026-04-17",
      "dueDate": "2026-04-22",
      "priority": "critical",
      "status": "complete",
      "checklistItems": [],
      "estimatedHours": 10,
      "requiresDocumentation": true,
      "actualHours": 3,
      "assigneeIds": [
        "ava"
      ],
      "workTypeId": "robot:manufacturing",
      "responsibleGroupId": null,
      "requestedById": "ava",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "drive-practice-apr-25"
        }
      ],
      "manufacturingDetails": {
        "part": {
          "kind": "part-definition",
          "partDefinitionId": "pd-swerve-encoder-bracket"
        },
        "quantity": 1,
        "processId": "3d-print",
        "fulfillmentSource": "outsourced",
        "material": {
          "kind": "inventory-material",
          "materialId": "mat-onyx-filament"
        },
        "fileArtifactIds": [],
        "tolerances": [],
        "qaRequirements": []
      }
    },
    {
      "id": "wire-swerve-module",
      "projectId": "project-robot-2026",
      "workstreamIds": [
        "workstream-drive"
      ],
      "title": "Wire Swerve Module",
      "summary": "Complete wiring and harness verification for the swerve module.",
      "subsystemIds": [
        "drive"
      ],
      "mechanismIds": [
        "swerve-module"
      ],
      "partInstanceIds": [],
      "ownerId": "ava",
      "mentorId": "jordan",
      "startDate": "2026-04-21",
      "dueDate": "2026-04-24",
      "priority": "medium",
      "status": "not-started",
      "checklistItems": [],
      "estimatedHours": 4,
      "requiresDocumentation": true,
      "actualHours": 1.25,
      "assigneeIds": [
        "ava"
      ],
      "workTypeId": "robot:electrical-wiring",
      "responsibleGroupId": "team-drivetrain",
      "requestedById": "ava",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "drive-practice-apr-25"
        }
      ],
      "manufacturingDetails": null
    },
    {
      "id": "intake-guard",
      "projectId": "project-robot-2026",
      "workstreamIds": [
        "workstream-manipulator"
      ],
      "title": "Intake belt guard redesign",
      "summary": "Rework geometry after pulley spacing changed midweek.",
      "subsystemIds": [
        "manipulator"
      ],
      "mechanismIds": [
        "intake-roller"
      ],
      "partInstanceIds": [
        "pi-intake-guard-set"
      ],
      "ownerId": "lucas",
      "mentorId": "riley",
      "startDate": "2026-04-18",
      "dueDate": "2026-04-25",
      "priority": "high",
      "status": "in-progress",
      "checklistItems": [],
      "estimatedHours": 12,
      "requiresDocumentation": true,
      "actualHours": 2.5,
      "assigneeIds": [
        "lucas"
      ],
      "workTypeId": "robot:design",
      "responsibleGroupId": null,
      "requestedById": "lucas",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "internal-review-apr-24"
        }
      ],
      "manufacturingDetails": null
    },
    {
      "id": "pdh-labels",
      "projectId": "project-robot-2026",
      "workstreamIds": [
        "workstream-drive"
      ],
      "title": "Wire Power Distribution",
      "summary": "Complete drivetrain power distribution wiring and upload inspection proof.",
      "subsystemIds": [
        "drive"
      ],
      "mechanismIds": [
        "power-distribution"
      ],
      "partInstanceIds": [
        "pi-pdh-label-set"
      ],
      "ownerId": "priya",
      "mentorId": "jordan",
      "startDate": "2026-04-16",
      "dueDate": "2026-04-20",
      "priority": "medium",
      "status": "complete",
      "checklistItems": [],
      "estimatedHours": 4,
      "requiresDocumentation": true,
      "actualHours": 1.5,
      "assigneeIds": [
        "priya"
      ],
      "workTypeId": "robot:electrical-wiring",
      "responsibleGroupId": null,
      "requestedById": "priya",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "internal-review-apr-24"
        }
      ],
      "manufacturingDetails": null
    },
    {
      "id": "wire-intake-roller",
      "projectId": "project-robot-2026",
      "workstreamIds": [
        "workstream-manipulator"
      ],
      "title": "Wire Intake Roller",
      "summary": "Complete wiring and connector verification for the intake roller.",
      "subsystemIds": [
        "manipulator"
      ],
      "mechanismIds": [
        "intake-roller"
      ],
      "partInstanceIds": [],
      "ownerId": "lucas",
      "mentorId": "riley",
      "startDate": "2026-04-21",
      "dueDate": "2026-04-25",
      "priority": "high",
      "status": "in-progress",
      "checklistItems": [],
      "estimatedHours": 5,
      "requiresDocumentation": true,
      "actualHours": 1.5,
      "assigneeIds": [
        "lucas"
      ],
      "workTypeId": "robot:electrical-wiring",
      "responsibleGroupId": null,
      "requestedById": "lucas",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "internal-review-apr-24"
        }
      ],
      "manufacturingDetails": null
    },
    {
      "id": "integrate-manipulator",
      "projectId": "project-robot-2026",
      "workstreamIds": [],
      "title": "Integrate Manipulator",
      "summary": "Complete integration and interface verification for the manipulator subsystem.",
      "subsystemIds": [
        "drive"
      ],
      "mechanismIds": [],
      "partInstanceIds": [],
      "ownerId": "ava",
      "mentorId": "jordan",
      "startDate": "2026-04-21",
      "dueDate": "2026-04-24",
      "priority": "medium",
      "status": "not-started",
      "checklistItems": [],
      "estimatedHours": 4,
      "requiresDocumentation": true,
      "actualHours": 1,
      "assigneeIds": [
        "ava"
      ],
      "workTypeId": "robot:testing",
      "responsibleGroupId": null,
      "requestedById": "ava",
      "scheduleRefs": [],
      "manufacturingDetails": null
    },
    {
      "id": "auto-safety-review",
      "projectId": "project-robot-2026",
      "workstreamIds": [
        "workstream-controls"
      ],
      "title": "Auto path safety review",
      "summary": "Review hard limits, driver abort behavior, and path assumptions.",
      "subsystemIds": [
        "controls"
      ],
      "mechanismIds": [
        "auto-safety"
      ],
      "partInstanceIds": [],
      "ownerId": "ethan",
      "mentorId": "riley",
      "startDate": "2026-04-22",
      "dueDate": "2026-04-27",
      "priority": "high",
      "status": "not-started",
      "checklistItems": [],
      "estimatedHours": 8,
      "requiresDocumentation": true,
      "actualHours": 1.25,
      "assigneeIds": [
        "ethan"
      ],
      "workTypeId": "robot:testing",
      "responsibleGroupId": null,
      "requestedById": "ethan",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "drive-practice-apr-25"
        }
      ],
      "manufacturingDetails": null
    },
    {
      "id": "pit-checklist",
      "projectId": "project-robot-2026",
      "workstreamIds": [],
      "title": "Drivetrain master wiring",
      "summary": "Coordinate the final drivetrain harness, breaker labeling, and inspection pass.",
      "subsystemIds": [
        "drive"
      ],
      "mechanismIds": [],
      "partInstanceIds": [],
      "ownerId": "ava",
      "mentorId": "jordan",
      "startDate": "2026-04-19",
      "dueDate": "2026-04-24",
      "priority": "low",
      "status": "in-progress",
      "checklistItems": [],
      "estimatedHours": 5,
      "requiresDocumentation": true,
      "actualHours": 1,
      "assigneeIds": [
        "ava"
      ],
      "workTypeId": "robot:electrical-wiring",
      "responsibleGroupId": null,
      "requestedById": "ava",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "internal-review-apr-24"
        }
      ],
      "manufacturingDetails": null
    },
    {
      "id": "wire-auto-safety",
      "projectId": "project-robot-2026",
      "workstreamIds": [
        "workstream-controls"
      ],
      "title": "Wire Auto Safety",
      "summary": "Complete wiring and control harness verification for auto safety.",
      "subsystemIds": [
        "controls"
      ],
      "mechanismIds": [
        "auto-safety"
      ],
      "partInstanceIds": [],
      "ownerId": "ethan",
      "mentorId": "riley",
      "startDate": "2026-04-22",
      "dueDate": "2026-04-27",
      "priority": "medium",
      "status": "not-started",
      "checklistItems": [],
      "estimatedHours": 3,
      "requiresDocumentation": true,
      "actualHours": 1,
      "assigneeIds": [
        "ethan"
      ],
      "workTypeId": "robot:electrical-wiring",
      "responsibleGroupId": null,
      "requestedById": "ethan",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "drive-practice-apr-25"
        }
      ],
      "manufacturingDetails": null
    },
    {
      "id": "integrate-controls",
      "projectId": "project-robot-2026",
      "workstreamIds": [],
      "title": "Integrate Controls",
      "summary": "Complete integration and interface verification for the controls subsystem.",
      "subsystemIds": [
        "drive"
      ],
      "mechanismIds": [],
      "partInstanceIds": [],
      "ownerId": "ava",
      "mentorId": "jordan",
      "startDate": "2026-04-22",
      "dueDate": "2026-04-27",
      "priority": "medium",
      "status": "not-started",
      "checklistItems": [],
      "estimatedHours": 4,
      "requiresDocumentation": true,
      "actualHours": 1.5,
      "assigneeIds": [
        "ava"
      ],
      "workTypeId": "robot:testing",
      "responsibleGroupId": null,
      "requestedById": "ava",
      "scheduleRefs": [],
      "manufacturingDetails": null
    },
    {
      "id": "vision-calibration-sweep",
      "projectId": "project-robot-2026",
      "workstreamIds": [
        "workstream-controls"
      ],
      "title": "Vision calibration sweep",
      "summary": "Validate camera offsets and localization confidence across field zones.",
      "subsystemIds": [
        "vision"
      ],
      "mechanismIds": [
        "limelight-mount"
      ],
      "partInstanceIds": [
        "pi-limelight-mount"
      ],
      "ownerId": "ethan",
      "mentorId": "riley",
      "startDate": "2026-04-24",
      "dueDate": "2026-05-01",
      "priority": "high",
      "status": "in-progress",
      "checklistItems": [],
      "estimatedHours": 9,
      "requiresDocumentation": true,
      "actualHours": 2,
      "assigneeIds": [
        "ethan"
      ],
      "workTypeId": "robot:programming",
      "responsibleGroupId": null,
      "requestedById": "ethan",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "robot-readiness-may-02"
        }
      ],
      "manufacturingDetails": null
    },
    {
      "id": "wire-limelight-mount",
      "projectId": "project-robot-2026",
      "workstreamIds": [
        "workstream-controls"
      ],
      "title": "Wire Limelight Mount",
      "summary": "Build strain-relieved harnessing for the vision mount assembly.",
      "subsystemIds": [
        "vision"
      ],
      "mechanismIds": [
        "limelight-mount"
      ],
      "partInstanceIds": [],
      "ownerId": "ethan",
      "mentorId": "riley",
      "startDate": "2026-04-25",
      "dueDate": "2026-04-30",
      "priority": "medium",
      "status": "not-started",
      "checklistItems": [],
      "estimatedHours": 3,
      "requiresDocumentation": true,
      "actualHours": 1.25,
      "assigneeIds": [
        "ethan"
      ],
      "workTypeId": "robot:electrical-wiring",
      "responsibleGroupId": null,
      "requestedById": "ethan",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "robot-readiness-may-02"
        }
      ],
      "manufacturingDetails": null
    },
    {
      "id": "climb-load-test",
      "projectId": "project-robot-2026",
      "workstreamIds": [
        "workstream-manipulator"
      ],
      "title": "Climb winch load test",
      "summary": "Run staged load tests and record repeatability for endgame climb.",
      "subsystemIds": [
        "climber"
      ],
      "mechanismIds": [
        "climb-winch"
      ],
      "partInstanceIds": [
        "pi-climb-winch-spacer-set"
      ],
      "ownerId": "ben",
      "mentorId": "jordan",
      "startDate": "2026-04-27",
      "dueDate": "2026-05-06",
      "priority": "critical",
      "status": "not-started",
      "checklistItems": [],
      "estimatedHours": 11,
      "requiresDocumentation": true,
      "actualHours": 1,
      "assigneeIds": [
        "ben"
      ],
      "workTypeId": "robot:testing",
      "responsibleGroupId": null,
      "requestedById": "ben",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "week-zero-may-09"
        }
      ],
      "manufacturingDetails": null
    },
    {
      "id": "integrate-vision",
      "projectId": "project-robot-2026",
      "workstreamIds": [],
      "title": "Integrate Vision",
      "summary": "Complete integration checks between vision outputs and drive controls.",
      "subsystemIds": [
        "drive"
      ],
      "mechanismIds": [],
      "partInstanceIds": [],
      "ownerId": "ava",
      "mentorId": "jordan",
      "startDate": "2026-05-01",
      "dueDate": "2026-05-07",
      "priority": "medium",
      "status": "not-started",
      "checklistItems": [],
      "estimatedHours": 4,
      "requiresDocumentation": true,
      "actualHours": 1,
      "assigneeIds": [
        "ava"
      ],
      "workTypeId": "robot:testing",
      "responsibleGroupId": null,
      "requestedById": "ava",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "week-zero-may-09"
        }
      ],
      "manufacturingDetails": null
    },
    {
      "id": "pit-board-refresh",
      "projectId": "project-operations-2026",
      "workstreamIds": [
        "workstream-operations-logistics"
      ],
      "title": "Pit board refresh",
      "summary": "Update pit board ownership lanes and queue handoff workflow.",
      "subsystemIds": [
        "pit-readiness"
      ],
      "mechanismIds": [
        "pit-board"
      ],
      "partInstanceIds": [
        "pi-pit-board-frame"
      ],
      "ownerId": "sofia",
      "mentorId": "marco",
      "startDate": "2026-04-24",
      "dueDate": "2026-04-28",
      "priority": "high",
      "status": "complete",
      "checklistItems": [],
      "estimatedHours": 6,
      "requiresDocumentation": true,
      "actualHours": 1.5,
      "assigneeIds": [
        "sofia"
      ],
      "workTypeId": "operations:planning",
      "responsibleGroupId": null,
      "requestedById": "sofia",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "pit-freeze-apr-28"
        }
      ],
      "manufacturingDetails": null
    },
    {
      "id": "pit-bin-labeling",
      "projectId": "project-operations-2026",
      "workstreamIds": [
        "workstream-operations-logistics"
      ],
      "title": "Pit bin labeling pass",
      "summary": "Standardize spare bin labels and map codes for fast retrieval.",
      "subsystemIds": [
        "pit-readiness"
      ],
      "mechanismIds": [
        "pit-board"
      ],
      "partInstanceIds": [],
      "ownerId": "olivia",
      "mentorId": "marco",
      "startDate": "2026-04-25",
      "dueDate": "2026-04-28",
      "priority": "medium",
      "status": "not-started",
      "checklistItems": [],
      "estimatedHours": 3,
      "requiresDocumentation": false,
      "actualHours": 1,
      "assigneeIds": [
        "olivia"
      ],
      "workTypeId": "operations:documentation",
      "responsibleGroupId": null,
      "requestedById": "olivia",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "pit-freeze-apr-28"
        }
      ],
      "manufacturingDetails": null
    },
    {
      "id": "travel-pack-finalize",
      "projectId": "project-operations-2026",
      "workstreamIds": [
        "workstream-operations-logistics"
      ],
      "title": "Travel pack finalize",
      "summary": "Finalize travel roster, contact cards, and emergency procedures packet.",
      "subsystemIds": [
        "operations"
      ],
      "mechanismIds": [],
      "partInstanceIds": [],
      "ownerId": "maya",
      "mentorId": "marco",
      "startDate": "2026-04-27",
      "dueDate": "2026-05-03",
      "priority": "medium",
      "status": "in-progress",
      "checklistItems": [],
      "estimatedHours": 5,
      "requiresDocumentation": true,
      "actualHours": 1.5,
      "assigneeIds": [
        "olivia"
      ],
      "workTypeId": "operations:planning",
      "responsibleGroupId": null,
      "requestedById": "maya",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "week-zero-may-09"
        }
      ],
      "manufacturingDetails": null
    },
    {
      "id": "outreach-kiosk-assembly",
      "projectId": "project-outreach-2026",
      "workstreamIds": [
        "workstream-outreach-milestones"
      ],
      "title": "Outreach kiosk assembly",
      "summary": "Assemble and stage kiosk hardware for STEM Night demos.",
      "subsystemIds": [
        "outreach"
      ],
      "mechanismIds": [
        "demo-kiosk"
      ],
      "partInstanceIds": [
        "pi-demo-kiosk-signage"
      ],
      "ownerId": "zoe",
      "mentorId": "marco",
      "startDate": "2026-04-26",
      "dueDate": "2026-05-04",
      "priority": "high",
      "status": "in-progress",
      "checklistItems": [],
      "estimatedHours": 7,
      "requiresDocumentation": true,
      "actualHours": 2,
      "assigneeIds": [
        "zoe"
      ],
      "workTypeId": "outreach:presentation",
      "responsibleGroupId": null,
      "requestedById": "zoe",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "stem-night-may-05"
        }
      ],
      "manufacturingDetails": null
    },
    {
      "id": "outreach-script-rehearsal",
      "projectId": "project-outreach-2026",
      "workstreamIds": [
        "workstream-outreach-content"
      ],
      "title": "Outreach script rehearsal",
      "summary": "Run timed script rehearsals with volunteer presenters.",
      "subsystemIds": [
        "outreach"
      ],
      "mechanismIds": [
        "demo-kiosk"
      ],
      "partInstanceIds": [],
      "ownerId": "zoe",
      "mentorId": "marco",
      "startDate": "2026-04-28",
      "dueDate": "2026-05-04",
      "priority": "medium",
      "status": "not-started",
      "checklistItems": [],
      "estimatedHours": 4,
      "requiresDocumentation": false,
      "actualHours": 1.25,
      "assigneeIds": [
        "zoe"
      ],
      "workTypeId": "outreach:engagement",
      "responsibleGroupId": null,
      "requestedById": "zoe",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "stem-night-may-05"
        }
      ],
      "manufacturingDetails": null
    },
    {
      "id": "scouting-tablet-refresh",
      "projectId": "project-training-2026",
      "workstreamIds": [
        "workstream-scouting-data"
      ],
      "title": "Scouting tablet refresh",
      "summary": "Re-image tablets and validate milestone sync reliability under load.",
      "subsystemIds": [
        "scouting"
      ],
      "mechanismIds": [
        "tablet-sync"
      ],
      "partInstanceIds": [
        "pi-tablet-mount-brackets"
      ],
      "ownerId": "noah",
      "mentorId": "riley",
      "startDate": "2026-04-24",
      "dueDate": "2026-05-02",
      "priority": "high",
      "status": "in-progress",
      "checklistItems": [],
      "estimatedHours": 8,
      "requiresDocumentation": true,
      "actualHours": 2.5,
      "assigneeIds": [
        "noah"
      ],
      "workTypeId": "training:instruction",
      "responsibleGroupId": null,
      "requestedById": "noah",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "week-zero-may-09"
        }
      ],
      "manufacturingDetails": null
    },
    {
      "id": "scouting-rubric-training",
      "projectId": "project-training-2026",
      "workstreamIds": [
        "workstream-scouting-training"
      ],
      "title": "Scouting rubric training",
      "summary": "Deliver training sessions for scouts and measure agreement on sample matches.",
      "subsystemIds": [
        "scouting"
      ],
      "mechanismIds": [],
      "partInstanceIds": [],
      "ownerId": "sofia",
      "mentorId": "riley",
      "startDate": "2026-04-29",
      "dueDate": "2026-05-06",
      "priority": "medium",
      "status": "not-started",
      "checklistItems": [],
      "estimatedHours": 5,
      "requiresDocumentation": true,
      "actualHours": 1.25,
      "assigneeIds": [
        "sofia"
      ],
      "workTypeId": "training:assessment",
      "responsibleGroupId": null,
      "requestedById": "sofia",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "week-zero-may-09"
        }
      ],
      "manufacturingDetails": null
    },
    {
      "id": "media-highlight-cut",
      "projectId": "project-media-2026",
      "workstreamIds": [
        "workstream-media-content"
      ],
      "title": "Robot reveal highlight cut",
      "summary": "Edit, color-balance, and export the first reveal-ready highlight package.",
      "subsystemIds": [
        "media-production"
      ],
      "mechanismIds": [
        "highlights-pipeline"
      ],
      "partInstanceIds": [
        "pi-camera-rig-plate"
      ],
      "ownerId": "zoe",
      "mentorId": "marco",
      "startDate": "2026-05-02",
      "dueDate": "2026-05-07",
      "priority": "high",
      "status": "in-progress",
      "checklistItems": [],
      "estimatedHours": 8,
      "requiresDocumentation": true,
      "actualHours": 2.25,
      "assigneeIds": [
        "zoe"
      ],
      "workTypeId": "media:video",
      "responsibleGroupId": null,
      "requestedById": "zoe",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "robot-reveal-may-08"
        }
      ],
      "manufacturingDetails": null
    },
    {
      "id": "media-social-rollout",
      "projectId": "project-media-2026",
      "workstreamIds": [
        "workstream-media-content"
      ],
      "title": "Reveal social rollout pack",
      "summary": "Prepare short-form clips, captions, and publishing checklist for reveal day.",
      "subsystemIds": [
        "media-production"
      ],
      "mechanismIds": [
        "highlights-pipeline"
      ],
      "partInstanceIds": [],
      "ownerId": "zoe",
      "mentorId": "marco",
      "startDate": "2026-05-04",
      "dueDate": "2026-05-08",
      "priority": "medium",
      "status": "not-started",
      "checklistItems": [],
      "estimatedHours": 4,
      "requiresDocumentation": true,
      "actualHours": 1,
      "assigneeIds": [
        "zoe"
      ],
      "workTypeId": "media:social-media",
      "responsibleGroupId": null,
      "requestedById": "zoe",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "robot-reveal-may-08"
        }
      ],
      "manufacturingDetails": null
    },
    {
      "id": "strategy-opponent-model-update",
      "projectId": "project-strategy-2026",
      "workstreamIds": [
        "workstream-strategy-scouting"
      ],
      "title": "Opponent model refresh",
      "summary": "Update trend scores and risk tags from the latest scrimmage scouting set.",
      "subsystemIds": [
        "strategy"
      ],
      "mechanismIds": [
        "alliance-modeling"
      ],
      "partInstanceIds": [],
      "ownerId": "noah",
      "mentorId": "riley",
      "startDate": "2026-05-01",
      "dueDate": "2026-05-05",
      "priority": "high",
      "status": "complete",
      "checklistItems": [],
      "estimatedHours": 6,
      "requiresDocumentation": true,
      "actualHours": 2,
      "assigneeIds": [
        "noah"
      ],
      "workTypeId": "strategy:data-analysis",
      "responsibleGroupId": null,
      "requestedById": "noah",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "strategy-picklist-freeze-may-06"
        }
      ],
      "manufacturingDetails": null
    },
    {
      "id": "strategy-playoff-scenario-cards",
      "projectId": "project-strategy-2026",
      "workstreamIds": [
        "workstream-strategy-playbooks"
      ],
      "title": "Playoff scenario cards",
      "summary": "Create alliance scenario cards for defense-heavy, cycle-heavy, and balanced matches.",
      "subsystemIds": [
        "strategy"
      ],
      "mechanismIds": [
        "alliance-modeling"
      ],
      "partInstanceIds": [],
      "ownerId": "noah",
      "mentorId": "riley",
      "startDate": "2026-05-02",
      "dueDate": "2026-05-08",
      "priority": "medium",
      "status": "in-progress",
      "checklistItems": [],
      "estimatedHours": 5,
      "requiresDocumentation": true,
      "actualHours": 1.5,
      "assigneeIds": [
        "noah"
      ],
      "workTypeId": "strategy:game-analysis",
      "responsibleGroupId": null,
      "requestedById": "noah",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "strategy-picklist-freeze-may-06"
        }
      ],
      "manufacturingDetails": null
    },
    {
      "id": "strategy-drive-team-brief",
      "projectId": "project-strategy-2026",
      "workstreamIds": [
        "workstream-strategy-playbooks"
      ],
      "title": "Drive-team strategy brief",
      "summary": "Run final drive-team briefing using updated matchup cards and contingency notes.",
      "subsystemIds": [
        "strategy"
      ],
      "mechanismIds": [],
      "partInstanceIds": [],
      "ownerId": "noah",
      "mentorId": "riley",
      "startDate": "2026-05-06",
      "dueDate": "2026-05-08",
      "priority": "medium",
      "status": "not-started",
      "checklistItems": [],
      "estimatedHours": 3,
      "requiresDocumentation": true,
      "actualHours": 0.75,
      "assigneeIds": [
        "noah"
      ],
      "workTypeId": "strategy:documentation",
      "responsibleGroupId": null,
      "requestedById": "noah",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "week-zero-may-09"
        }
      ],
      "manufacturingDetails": null
    },
    {
      "id": "manufacture-sensor-bracket",
      "projectId": "project-robot-2026",
      "workTypeId": "robot:manufacturing",
      "responsibleGroupId": null,
      "requestedById": "ava",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "drive-practice-apr-25"
        }
      ],
      "manufacturingDetails": {
        "part": {
          "kind": "part-definition",
          "partDefinitionId": "pd-swerve-encoder-bracket"
        },
        "quantity": 2,
        "processId": "3d-print",
        "fulfillmentSource": "in-house",
        "material": {
          "kind": "inventory-material",
          "materialId": "mat-onyx-filament"
        },
        "fileArtifactIds": [],
        "tolerances": [],
        "qaRequirements": []
      },
      "workstreamIds": [
        "workstream-drive"
      ],
      "title": "Swerve Encoder Bracket",
      "summary": "Historical manufacturing demo for swerve encoder bracket.",
      "subsystemIds": [
        "drive"
      ],
      "mechanismIds": [
        "swerve-module"
      ],
      "partInstanceIds": [
        "pi-swerve-encoder-bracket-front-left"
      ],
      "ownerId": "ava",
      "assigneeIds": [
        "ava"
      ],
      "mentorId": "jordan",
      "startDate": "2026-04-17",
      "dueDate": "2026-04-22",
      "priority": "medium",
      "status": "not-started",
      "checklistItems": [],
      "estimatedHours": 10,
      "actualHours": 3,
      "requiresDocumentation": false
    },
    {
      "id": "manufacture-guard-cnc",
      "projectId": "project-robot-2026",
      "workTypeId": "robot:manufacturing",
      "responsibleGroupId": null,
      "requestedById": "lucas",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "internal-review-apr-24"
        }
      ],
      "manufacturingDetails": {
        "part": {
          "kind": "part-definition",
          "partDefinitionId": "pd-intake-guard"
        },
        "quantity": 4,
        "processId": "cnc",
        "fulfillmentSource": "in-house",
        "material": {
          "kind": "inventory-material",
          "materialId": "mat-1-8-polycarbonate"
        },
        "fileArtifactIds": [],
        "tolerances": [],
        "qaRequirements": []
      },
      "workstreamIds": [
        "workstream-manipulator"
      ],
      "title": "Intake Guard Plate",
      "summary": "Historical manufacturing demo for intake guard plate.",
      "subsystemIds": [
        "manipulator"
      ],
      "mechanismIds": [
        "intake-roller"
      ],
      "partInstanceIds": [
        "pi-intake-guard-set"
      ],
      "ownerId": "lucas",
      "assigneeIds": [
        "lucas"
      ],
      "mentorId": "riley",
      "startDate": "2026-04-18",
      "dueDate": "2026-04-24",
      "priority": "medium",
      "status": "in-progress",
      "checklistItems": [],
      "estimatedHours": 12,
      "actualHours": 2.5,
      "requiresDocumentation": false
    },
    {
      "id": "manufacture-frame-weldment",
      "projectId": "project-robot-2026",
      "workTypeId": "robot:manufacturing",
      "responsibleGroupId": null,
      "requestedById": "lucas",
      "scheduleRefs": [],
      "manufacturingDetails": {
        "part": {
          "kind": "provisional",
          "partNumber": "TUT-frame-weldment",
          "revision": "A"
        },
        "quantity": 1,
        "processId": "fabrication",
        "fulfillmentSource": "in-house",
        "material": {
          "kind": "specified-material",
          "name": "1/8 aluminum tube"
        },
        "fileArtifactIds": [],
        "tolerances": [],
        "qaRequirements": []
      },
      "workstreamIds": [],
      "title": "Intake Frame Weldment",
      "summary": "Historical manufacturing demo for intake frame weldment.",
      "subsystemIds": [
        "manipulator"
      ],
      "mechanismIds": [],
      "partInstanceIds": [],
      "ownerId": "lucas",
      "assigneeIds": [
        "lucas"
      ],
      "mentorId": null,
      "startDate": "2026-04-28",
      "dueDate": "2026-04-28",
      "priority": "medium",
      "status": "not-started",
      "checklistItems": [],
      "estimatedHours": 0,
      "actualHours": 0,
      "requiresDocumentation": false
    },
    {
      "id": "manufacture-limelight-mount-plate-cnc",
      "projectId": "project-robot-2026",
      "workTypeId": "robot:manufacturing",
      "responsibleGroupId": null,
      "requestedById": "ethan",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "robot-readiness-may-02"
        }
      ],
      "manufacturingDetails": {
        "part": {
          "kind": "part-definition",
          "partDefinitionId": "pd-limelight-mount-plate"
        },
        "quantity": 2,
        "processId": "cnc",
        "fulfillmentSource": "in-house",
        "material": {
          "kind": "inventory-material",
          "materialId": "mat-6061-angle"
        },
        "fileArtifactIds": [],
        "tolerances": [],
        "qaRequirements": []
      },
      "workstreamIds": [
        "workstream-controls"
      ],
      "title": "Limelight Mount Plate",
      "summary": "Historical manufacturing demo for limelight mount plate.",
      "subsystemIds": [
        "vision"
      ],
      "mechanismIds": [
        "limelight-mount"
      ],
      "partInstanceIds": [
        "pi-limelight-mount"
      ],
      "ownerId": "ethan",
      "assigneeIds": [
        "ethan"
      ],
      "mentorId": "riley",
      "startDate": "2026-04-24",
      "dueDate": "2026-04-30",
      "priority": "medium",
      "status": "not-started",
      "checklistItems": [],
      "estimatedHours": 9,
      "actualHours": 2,
      "requiresDocumentation": false
    },
    {
      "id": "manufacture-climb-winch-spacer-print",
      "projectId": "project-robot-2026",
      "workTypeId": "robot:manufacturing",
      "responsibleGroupId": null,
      "requestedById": "ben",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "week-zero-may-09"
        }
      ],
      "manufacturingDetails": {
        "part": {
          "kind": "part-definition",
          "partDefinitionId": "pd-climb-winch-spacer"
        },
        "quantity": 4,
        "processId": "3d-print",
        "fulfillmentSource": "in-house",
        "material": {
          "kind": "inventory-material",
          "materialId": "mat-onyx-filament"
        },
        "fileArtifactIds": [],
        "tolerances": [],
        "qaRequirements": []
      },
      "workstreamIds": [
        "workstream-manipulator"
      ],
      "title": "Climb Winch Spacer Set",
      "summary": "Historical manufacturing demo for climb winch spacer set.",
      "subsystemIds": [
        "climber"
      ],
      "mechanismIds": [
        "climb-winch"
      ],
      "partInstanceIds": [
        "pi-climb-winch-spacer-set"
      ],
      "ownerId": "ben",
      "assigneeIds": [
        "ben"
      ],
      "mentorId": "jordan",
      "startDate": "2026-04-27",
      "dueDate": "2026-05-02",
      "priority": "medium",
      "status": "in-progress",
      "checklistItems": [],
      "estimatedHours": 11,
      "actualHours": 1,
      "requiresDocumentation": false
    },
    {
      "id": "manufacture-pit-board-frame-fab",
      "projectId": "project-robot-2026",
      "workTypeId": "robot:manufacturing",
      "responsibleGroupId": null,
      "requestedById": "sofia",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "pit-freeze-apr-28"
        }
      ],
      "manufacturingDetails": {
        "part": {
          "kind": "provisional",
          "partNumber": "TUT-pit-board-frame-fab",
          "revision": "A"
        },
        "quantity": 1,
        "processId": "fabrication",
        "fulfillmentSource": "in-house",
        "material": {
          "kind": "specified-material",
          "name": "Aluminum angle and panel stock"
        },
        "fileArtifactIds": [],
        "tolerances": [],
        "qaRequirements": []
      },
      "workstreamIds": [],
      "title": "Pit Board Frame",
      "summary": "Historical manufacturing demo for pit board frame.",
      "subsystemIds": [
        "shared-fabrication"
      ],
      "mechanismIds": [
        "team-prototype-shop"
      ],
      "partInstanceIds": [],
      "ownerId": "sofia",
      "assigneeIds": [
        "sofia"
      ],
      "mentorId": "marco",
      "startDate": "2026-04-24",
      "dueDate": "2026-04-27",
      "priority": "medium",
      "status": "not-started",
      "checklistItems": [],
      "estimatedHours": 6,
      "actualHours": 1.5,
      "requiresDocumentation": false
    },
    {
      "id": "manufacture-demo-kiosk-signage-print",
      "projectId": "project-robot-2026",
      "workTypeId": "robot:manufacturing",
      "responsibleGroupId": null,
      "requestedById": "zoe",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "stem-night-may-05"
        }
      ],
      "manufacturingDetails": {
        "part": {
          "kind": "provisional",
          "partNumber": "TUT-demo-kiosk-signage-print",
          "revision": "A"
        },
        "quantity": 1,
        "processId": "fabrication",
        "fulfillmentSource": "in-house",
        "material": {
          "kind": "inventory-material",
          "materialId": "mat-vinyl-banner"
        },
        "fileArtifactIds": [],
        "tolerances": [],
        "qaRequirements": []
      },
      "workstreamIds": [],
      "title": "Demo Kiosk Signage Kit",
      "summary": "Historical manufacturing demo for demo kiosk signage kit.",
      "subsystemIds": [
        "shared-fabrication"
      ],
      "mechanismIds": [
        "team-prototype-shop"
      ],
      "partInstanceIds": [],
      "ownerId": "zoe",
      "assigneeIds": [
        "zoe"
      ],
      "mentorId": "marco",
      "startDate": "2026-04-26",
      "dueDate": "2026-05-03",
      "priority": "medium",
      "status": "in-progress",
      "checklistItems": [],
      "estimatedHours": 7,
      "actualHours": 2,
      "requiresDocumentation": false
    },
    {
      "id": "manufacture-tablet-bracket-cut",
      "projectId": "project-robot-2026",
      "workTypeId": "robot:manufacturing",
      "responsibleGroupId": null,
      "requestedById": "noah",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "week-zero-may-09"
        }
      ],
      "manufacturingDetails": {
        "part": {
          "kind": "part-definition",
          "partDefinitionId": "pd-tablet-mount-bracket"
        },
        "quantity": 8,
        "processId": "cnc",
        "fulfillmentSource": "outsourced",
        "material": {
          "kind": "inventory-material",
          "materialId": "mat-1-8-polycarbonate"
        },
        "fileArtifactIds": [],
        "tolerances": [],
        "qaRequirements": []
      },
      "workstreamIds": [],
      "title": "Tablet Mount Bracket Set",
      "summary": "Historical manufacturing demo for tablet mount bracket set.",
      "subsystemIds": [
        "shared-fabrication"
      ],
      "mechanismIds": [
        "team-prototype-shop"
      ],
      "partInstanceIds": [],
      "ownerId": "noah",
      "assigneeIds": [
        "noah"
      ],
      "mentorId": "riley",
      "startDate": "2026-04-24",
      "dueDate": "2026-05-02",
      "priority": "medium",
      "status": "not-started",
      "checklistItems": [],
      "estimatedHours": 8,
      "actualHours": 2.5,
      "requiresDocumentation": false
    },
    {
      "id": "manufacture-camera-rig-plate-cnc",
      "projectId": "project-robot-2026",
      "workTypeId": "robot:manufacturing",
      "responsibleGroupId": null,
      "requestedById": "zoe",
      "scheduleRefs": [
        {
          "kind": "milestone",
          "id": "robot-reveal-may-08"
        }
      ],
      "manufacturingDetails": {
        "part": {
          "kind": "part-definition",
          "partDefinitionId": "pd-camera-rig-plate"
        },
        "quantity": 1,
        "processId": "cnc",
        "fulfillmentSource": "in-house",
        "material": {
          "kind": "inventory-material",
          "materialId": "mat-6061-angle"
        },
        "fileArtifactIds": [],
        "tolerances": [],
        "qaRequirements": []
      },
      "workstreamIds": [],
      "title": "Camera Rig Plate",
      "summary": "Historical manufacturing demo for camera rig plate.",
      "subsystemIds": [
        "shared-fabrication"
      ],
      "mechanismIds": [
        "team-prototype-shop"
      ],
      "partInstanceIds": [],
      "ownerId": "zoe",
      "assigneeIds": [
        "zoe"
      ],
      "mentorId": "marco",
      "startDate": "2026-05-02",
      "dueDate": "2026-05-06",
      "priority": "medium",
      "status": "complete",
      "checklistItems": [],
      "estimatedHours": 8,
      "actualHours": 2.25,
      "requiresDocumentation": false
    }
  ],
  "milestones": [
    {
      "id": "tutorial-season-kickoff-jan-10",
      "seasonId": "default-season",
      "title": "Tutorial Season Kickoff",
      "type": "internal-review",
      "startAt": "2026-01-10T18:00:00-05:00",
      "endAt": "2026-01-10T19:00:00-05:00",
      "isExternal": false,
      "description": "Introductory milestone for the tutorial season workspace and onboarding flow.",
      "status": "complete",
      "projectIds": [
        "project-operations-2026",
        "project-training-2026"
      ]
    },
    {
      "id": "tutorial-robot-checkpoint-feb-21",
      "seasonId": "default-season",
      "title": "Robot Checkpoint",
      "type": "practice",
      "startAt": "2026-02-21T17:30:00-05:00",
      "endAt": "2026-02-21T19:00:00-05:00",
      "isExternal": false,
      "description": "Midseason checkpoint for drivetrain tuning and controls integration.",
      "status": "planned",
      "projectIds": [
        "project-robot-2026"
      ]
    },
    {
      "id": "tutorial-training-showcase-mar-21",
      "seasonId": "default-season",
      "title": "Training Showcase",
      "type": "demo",
      "startAt": "2026-03-21T17:00:00-04:00",
      "endAt": "2026-03-21T18:30:00-04:00",
      "isExternal": true,
      "description": "Tutorial-season demo milestone for training and outreach coordination.",
      "status": "complete",
      "projectIds": [
        "project-training-2026",
        "project-outreach-2026"
      ]
    },
    {
      "id": "drive-practice-apr-25",
      "seasonId": "default-season",
      "title": "Drive Practice",
      "type": "practice",
      "startAt": "2026-04-25T18:00:00-04:00",
      "endAt": "2026-04-25T20:30:00-04:00",
      "isExternal": false,
      "description": "Full robot practice used to validate control tuning and readiness.",
      "status": "complete",
      "projectIds": [
        "project-robot-2026"
      ]
    },
    {
      "id": "internal-review-apr-24",
      "seasonId": "default-season",
      "title": "Internal Design Review",
      "type": "internal-review",
      "startAt": "2026-04-24T19:00:00-04:00",
      "endAt": "2026-04-24T20:00:00-04:00",
      "isExternal": false,
      "description": "Subsystem leads review readiness before the next practice block.",
      "status": "planned",
      "projectIds": [
        "project-robot-2026"
      ]
    },
    {
      "id": "demo-apr-30",
      "seasonId": "default-season",
      "title": "Sponsor Demo",
      "type": "demo",
      "startAt": "2026-04-30T17:30:00-04:00",
      "endAt": "2026-04-30T19:00:00-04:00",
      "isExternal": true,
      "description": "External milestone that the team is aligning key finishing tasks to.",
      "status": "planned",
      "projectIds": [
        "project-robot-2026"
      ]
    },
    {
      "id": "pit-freeze-apr-28",
      "seasonId": "default-season",
      "title": "Pit Readiness Freeze",
      "type": "deadline",
      "startAt": "2026-04-28T20:00:00-04:00",
      "endAt": null,
      "isExternal": false,
      "description": "Final freeze for pit checklists, spare bins, and field-support documentation.",
      "status": "planned",
      "projectIds": [
        "project-operations-2026"
      ]
    },
    {
      "id": "week-zero-may-09",
      "seasonId": "default-season",
      "title": "Week Zero Scrimmage",
      "type": "competition",
      "startAt": "2026-05-09T08:00:00-04:00",
      "endAt": "2026-05-09T18:30:00-04:00",
      "isExternal": true,
      "description": "Practice competition to test robot reliability, scouting flow, and pit execution.",
      "status": "planned",
      "projectIds": [
        "project-robot-2026",
        "project-training-2026",
        "project-operations-2026"
      ]
    },
    {
      "id": "stem-night-may-05",
      "seasonId": "default-season",
      "title": "STEM Night Showcase",
      "type": "demo",
      "startAt": "2026-05-05T18:00:00-04:00",
      "endAt": "2026-05-05T20:00:00-04:00",
      "isExternal": true,
      "description": "Community outreach milestone featuring kiosk demos and student-led tours.",
      "status": "complete",
      "projectIds": [
        "project-outreach-2026"
      ]
    },
    {
      "id": "outreach-milestone-may-05",
      "seasonId": "default-season",
      "title": "Outreach Milestone",
      "type": "demo",
      "startAt": "2026-05-05T17:00:00-04:00",
      "endAt": "2026-05-05T17:30:00-04:00",
      "isExternal": true,
      "description": "Final outreach readiness checkpoint before STEM Night demos begin.",
      "status": "planned",
      "projectIds": [
        "project-outreach-2026"
      ]
    },
    {
      "id": "strategy-picklist-freeze-may-06",
      "seasonId": "default-season",
      "title": "Strategy Picklist Freeze",
      "type": "deadline",
      "startAt": "2026-05-06T20:00:00-04:00",
      "endAt": null,
      "isExternal": false,
      "description": "Lock final picklist criteria and alliance matchup assumptions before week-zero.",
      "status": "planned",
      "projectIds": [
        "project-strategy-2026",
        "project-training-2026"
      ]
    },
    {
      "id": "robot-reveal-may-08",
      "seasonId": "default-season",
      "title": "Robot Reveal Media Drop",
      "type": "demo",
      "startAt": "2026-05-08T19:00:00-04:00",
      "endAt": "2026-05-08T19:45:00-04:00",
      "isExternal": true,
      "description": "Publish reveal package across team channels with sponsor-approved visuals.",
      "status": "complete",
      "projectIds": [
        "project-media-2026",
        "project-robot-2026"
      ]
    },
    {
      "id": "robot-readiness-may-02",
      "seasonId": "default-season",
      "title": "Robot Readiness Review",
      "type": "internal-review",
      "startAt": "2026-05-02T10:00:00-04:00",
      "endAt": "2026-05-02T12:00:00-04:00",
      "isExternal": false,
      "description": "Cross-functional check before week-zero scrimmage.",
      "status": "complete",
      "projectIds": [
        "project-robot-2026"
      ]
    }
  ],
  "milestoneRequirements": [],
  "taskDependencies": [
    {
      "id": "dep-auto-safety-review-swerve-sensor-bundle",
      "taskId": "auto-safety-review",
      "kind": "task",
      "refId": "swerve-sensor-bundle",
      "requiredState": "complete",
      "dependencyType": "hard",
      "createdAt": "2026-04-22"
    },
    {
      "id": "dep-pit-checklist-pdh-labels",
      "taskId": "pit-checklist",
      "kind": "task",
      "refId": "pdh-labels",
      "requiredState": "complete",
      "dependencyType": "hard",
      "createdAt": "2026-04-19"
    },
    {
      "id": "dep-wire-auto-safety-swerve-sensor-bundle",
      "taskId": "wire-auto-safety",
      "kind": "task",
      "refId": "swerve-sensor-bundle",
      "requiredState": "complete",
      "dependencyType": "hard",
      "createdAt": "2026-04-22"
    },
    {
      "id": "dep-vision-calibration-sweep-swerve-sensor-bundle",
      "taskId": "vision-calibration-sweep",
      "kind": "task",
      "refId": "swerve-sensor-bundle",
      "requiredState": "complete",
      "dependencyType": "hard",
      "createdAt": "2026-04-24"
    },
    {
      "id": "dep-climb-load-test-integrate-controls",
      "taskId": "climb-load-test",
      "kind": "task",
      "refId": "integrate-controls",
      "requiredState": "complete",
      "dependencyType": "hard",
      "createdAt": "2026-04-27"
    },
    {
      "id": "dep-integrate-vision-vision-calibration-sweep",
      "taskId": "integrate-vision",
      "kind": "task",
      "refId": "vision-calibration-sweep",
      "requiredState": "complete",
      "dependencyType": "hard",
      "createdAt": "2026-05-01"
    },
    {
      "id": "dep-integrate-vision-wire-limelight-mount",
      "taskId": "integrate-vision",
      "kind": "task",
      "refId": "wire-limelight-mount",
      "requiredState": "complete",
      "dependencyType": "hard",
      "createdAt": "2026-05-01"
    },
    {
      "id": "dep-pit-bin-labeling-pit-board-refresh",
      "taskId": "pit-bin-labeling",
      "kind": "task",
      "refId": "pit-board-refresh",
      "requiredState": "complete",
      "dependencyType": "hard",
      "createdAt": "2026-04-25"
    },
    {
      "id": "dep-outreach-script-rehearsal-outreach-kiosk-assembly",
      "taskId": "outreach-script-rehearsal",
      "kind": "task",
      "refId": "outreach-kiosk-assembly",
      "requiredState": "complete",
      "dependencyType": "hard",
      "createdAt": "2026-04-28"
    },
    {
      "id": "dep-scouting-rubric-training-scouting-tablet-refresh",
      "taskId": "scouting-rubric-training",
      "kind": "task",
      "refId": "scouting-tablet-refresh",
      "requiredState": "complete",
      "dependencyType": "hard",
      "createdAt": "2026-04-29"
    },
    {
      "id": "dep-media-highlight-cut-outreach-kiosk-assembly",
      "taskId": "media-highlight-cut",
      "kind": "task",
      "refId": "outreach-kiosk-assembly",
      "requiredState": "complete",
      "dependencyType": "hard",
      "createdAt": "2026-05-02"
    },
    {
      "id": "dep-strategy-opponent-model-update-scouting-tablet-refresh",
      "taskId": "strategy-opponent-model-update",
      "kind": "task",
      "refId": "scouting-tablet-refresh",
      "requiredState": "complete",
      "dependencyType": "hard",
      "createdAt": "2026-05-01"
    },
    {
      "id": "dep-strategy-playoff-scenario-cards-strategy-opponent-model-update",
      "taskId": "strategy-playoff-scenario-cards",
      "kind": "task",
      "refId": "strategy-opponent-model-update",
      "requiredState": "complete",
      "dependencyType": "hard",
      "createdAt": "2026-05-02"
    },
    {
      "id": "dep-media-social-rollout-task",
      "taskId": "media-social-rollout",
      "kind": "task",
      "refId": "media-highlight-cut",
      "requiredState": "complete",
      "dependencyType": "hard",
      "createdAt": "2026-05-04T18:45:00-04:00"
    },
    {
      "id": "dep-media-highlight-part-ready",
      "taskId": "media-highlight-cut",
      "kind": "part-instance",
      "refId": "pi-camera-rig-plate",
      "requiredCondition": {
        "kind": "derived-readiness",
        "value": "ready"
      },
      "dependencyType": "hard",
      "createdAt": "2026-05-03T18:00:00-04:00"
    },
    {
      "id": "dep-strategy-playbook-freeze",
      "taskId": "strategy-playoff-scenario-cards",
      "kind": "milestone",
      "refId": "strategy-picklist-freeze-may-06",
      "requiredState": "not-ready",
      "dependencyType": "hard",
      "createdAt": "2026-05-04T20:00:00-04:00"
    },
    {
      "id": "dep-strategy-brief-soft",
      "taskId": "strategy-drive-team-brief",
      "kind": "task",
      "refId": "strategy-playoff-scenario-cards",
      "requiredState": "in-progress",
      "dependencyType": "soft",
      "createdAt": "2026-05-06T08:00:00-04:00"
    }
  ],
  "qaReports": [
    {
      "id": "qareport-swerve-sensor-bundle",
      "projectId": "project-robot-2026",
      "targetRefs": [
        {
          "kind": "task",
          "id": "swerve-sensor-bundle"
        }
      ],
      "createdByMemberId": "ava",
      "participantIds": [
        "ava",
        "jordan"
      ],
      "mentorId": "jordan",
      "requestedById": "ava",
      "summary": "Encoder verification evidence reviewed and accepted.",
      "notes": "Encoder verification evidence reviewed and accepted.",
      "createdAt": "2026-04-22T12:00:00Z",
      "status": "reviewed",
      "reportType": "qa",
      "result": "pass",
      "reviewedById": "jordan",
      "reviewedAt": "2026-04-22T12:00:00Z"
    },
    {
      "id": "qareport-intake-guard",
      "projectId": "project-robot-2026",
      "targetRefs": [
        {
          "kind": "task",
          "id": "intake-guard"
        }
      ],
      "createdByMemberId": "lucas",
      "participantIds": [
        "lucas",
        "riley"
      ],
      "mentorId": "riley",
      "requestedById": "lucas",
      "summary": "CNC cut quality needs another pass before closing this task.",
      "notes": "CNC cut quality needs another pass before closing this task.",
      "createdAt": "2026-04-21T12:00:00Z",
      "status": "reviewed",
      "reportType": "qa",
      "result": "minor-fix",
      "reviewedById": null,
      "reviewedAt": "2026-04-21T12:00:00Z"
    },
    {
      "id": "qareport-vision-calibration",
      "projectId": "project-robot-2026",
      "targetRefs": [
        {
          "kind": "task",
          "id": "vision-calibration-sweep"
        }
      ],
      "createdByMemberId": "ethan",
      "participantIds": [
        "ethan",
        "riley"
      ],
      "mentorId": "riley",
      "requestedById": "ethan",
      "summary": "Calibration passed indoors but still needs bright-light confidence checks.",
      "notes": "Calibration passed indoors but still needs bright-light confidence checks.",
      "createdAt": "2026-04-30T12:00:00Z",
      "status": "reviewed",
      "reportType": "qa",
      "result": "minor-fix",
      "reviewedById": null,
      "reviewedAt": "2026-04-30T12:00:00Z"
    },
    {
      "id": "qareport-pit-board-refresh",
      "projectId": "project-operations-2026",
      "targetRefs": [
        {
          "kind": "task",
          "id": "pit-board-refresh"
        }
      ],
      "createdByMemberId": "sofia",
      "participantIds": [
        "sofia",
        "marco"
      ],
      "mentorId": "marco",
      "requestedById": "sofia",
      "summary": "Pit board flow is clear and handoff timing fits the target window.",
      "notes": "Pit board flow is clear and handoff timing fits the target window.",
      "createdAt": "2026-04-28T12:00:00Z",
      "status": "reviewed",
      "reportType": "qa",
      "result": "pass",
      "reviewedById": "marco",
      "reviewedAt": "2026-04-28T12:00:00Z"
    },
    {
      "id": "qareport-kiosk-assembly",
      "projectId": "project-outreach-2026",
      "targetRefs": [
        {
          "kind": "task",
          "id": "outreach-kiosk-assembly"
        }
      ],
      "createdByMemberId": "zoe",
      "participantIds": [
        "zoe",
        "marco"
      ],
      "mentorId": "marco",
      "requestedById": "zoe",
      "summary": "Hardware is stable, but queue signage still needs clearer labeling.",
      "notes": "Hardware is stable, but queue signage still needs clearer labeling.",
      "createdAt": "2026-05-01T12:00:00Z",
      "status": "reviewed",
      "reportType": "qa",
      "result": "iteration-worthy",
      "reviewedById": null,
      "reviewedAt": "2026-05-01T12:00:00Z"
    },
    {
      "id": "qareport-tablet-refresh",
      "projectId": "project-training-2026",
      "targetRefs": [
        {
          "kind": "task",
          "id": "scouting-tablet-refresh"
        }
      ],
      "createdByMemberId": "noah",
      "participantIds": [
        "noah",
        "riley"
      ],
      "mentorId": "riley",
      "requestedById": "noah",
      "summary": "Sync retries are reduced, but two tablets still need reconnection handling.",
      "notes": "Sync retries are reduced, but two tablets still need reconnection handling.",
      "createdAt": "2026-05-02T12:00:00Z",
      "status": "reviewed",
      "reportType": "qa",
      "result": "minor-fix",
      "reviewedById": null,
      "reviewedAt": "2026-05-02T12:00:00Z"
    },
    {
      "id": "qa-1",
      "projectId": "project-robot-2026",
      "targetRefs": [
        {
          "kind": "task",
          "id": "pdh-labels"
        }
      ],
      "createdByMemberId": "priya",
      "participantIds": [
        "priya",
        "jordan"
      ],
      "mentorId": "jordan",
      "requestedById": "priya",
      "summary": "Inspection evidence uploaded and labels match the drivetrain notebook.",
      "notes": "Inspection evidence uploaded and labels match the drivetrain notebook.",
      "createdAt": "2026-04-20T12:00:00Z",
      "status": "reviewed",
      "reportType": "qa",
      "result": "pass",
      "reviewedById": "jordan",
      "reviewedAt": "2026-04-20T12:00:00Z"
    },
    {
      "id": "qa-2",
      "projectId": "project-robot-2026",
      "targetRefs": [
        {
          "kind": "task",
          "id": "swerve-sensor-bundle"
        }
      ],
      "createdByMemberId": "ava",
      "participantIds": [
        "ava",
        "jordan"
      ],
      "mentorId": "jordan",
      "requestedById": "ava",
      "summary": "Fit and dimensional checks passed on both printed parts.",
      "notes": "Fit and dimensional checks passed on both printed parts.",
      "createdAt": "2026-04-21T12:00:00Z",
      "status": "reviewed",
      "reportType": "qa",
      "result": "pass",
      "reviewedById": "jordan",
      "reviewedAt": "2026-04-21T12:00:00Z"
    },
    {
      "id": "qa-3",
      "projectId": "project-robot-2026",
      "targetRefs": [
        {
          "kind": "task",
          "id": "intake-guard"
        }
      ],
      "createdByMemberId": "lucas",
      "participantIds": [
        "lucas",
        "riley"
      ],
      "mentorId": "riley",
      "requestedById": "lucas",
      "summary": "Keep the task in progress and re-run after CNC cut.",
      "notes": "Keep the task in progress and re-run after CNC cut.",
      "createdAt": "2026-04-21T12:00:00Z",
      "status": "reviewed",
      "reportType": "qa",
      "result": "minor-fix",
      "reviewedById": null,
      "reviewedAt": "2026-04-21T12:00:00Z"
    },
    {
      "id": "qa-4",
      "projectId": "project-robot-2026",
      "targetRefs": [
        {
          "kind": "task",
          "id": "vision-calibration-sweep"
        }
      ],
      "createdByMemberId": "ethan",
      "participantIds": [
        "ethan",
        "riley"
      ],
      "mentorId": "riley",
      "requestedById": "ethan",
      "summary": "Confidence is improving but still inconsistent in high-angle trajectories.",
      "notes": "Confidence is improving but still inconsistent in high-angle trajectories.",
      "createdAt": "2026-04-30T12:00:00Z",
      "status": "reviewed",
      "reportType": "qa",
      "result": "minor-fix",
      "reviewedById": null,
      "reviewedAt": "2026-04-30T12:00:00Z"
    },
    {
      "id": "qa-5",
      "projectId": "project-robot-2026",
      "targetRefs": [
        {
          "kind": "task",
          "id": "swerve-sensor-bundle"
        }
      ],
      "createdByMemberId": "sofia",
      "participantIds": [
        "sofia",
        "marco"
      ],
      "mentorId": "marco",
      "requestedById": "ava",
      "summary": "Frame dimensions and mounting hardware match checklist layout requirements.",
      "notes": "Frame dimensions and mounting hardware match checklist layout requirements.",
      "createdAt": "2026-04-28T12:00:00Z",
      "status": "reviewed",
      "reportType": "qa",
      "result": "pass",
      "reviewedById": "marco",
      "reviewedAt": "2026-04-28T12:00:00Z"
    },
    {
      "id": "qa-6",
      "projectId": "project-outreach-2026",
      "targetRefs": [
        {
          "kind": "task",
          "id": "outreach-kiosk-assembly"
        }
      ],
      "createdByMemberId": "zoe",
      "participantIds": [
        "zoe",
        "marco"
      ],
      "mentorId": "marco",
      "requestedById": "zoe",
      "summary": "Kiosk build is solid, but demo queue signage should be simplified.",
      "notes": "Kiosk build is solid, but demo queue signage should be simplified.",
      "createdAt": "2026-05-01T12:00:00Z",
      "status": "reviewed",
      "reportType": "qa",
      "result": "iteration-worthy",
      "reviewedById": null,
      "reviewedAt": "2026-05-01T12:00:00Z"
    },
    {
      "id": "qa-7",
      "projectId": "project-training-2026",
      "targetRefs": [
        {
          "kind": "task",
          "id": "scouting-tablet-refresh"
        }
      ],
      "createdByMemberId": "noah",
      "participantIds": [
        "noah",
        "riley"
      ],
      "mentorId": "riley",
      "requestedById": "noah",
      "summary": "Most sync paths are stable; two edge-case reconnect paths still need hardening.",
      "notes": "Most sync paths are stable; two edge-case reconnect paths still need hardening.",
      "createdAt": "2026-05-02T12:00:00Z",
      "status": "reviewed",
      "reportType": "qa",
      "result": "minor-fix",
      "reviewedById": null,
      "reviewedAt": "2026-05-02T12:00:00Z"
    },
    {
      "id": "qa-8",
      "projectId": "project-strategy-2026",
      "targetRefs": [
        {
          "kind": "task",
          "id": "strategy-opponent-model-update"
        }
      ],
      "createdByMemberId": "noah",
      "participantIds": [
        "noah",
        "riley"
      ],
      "mentorId": "riley",
      "requestedById": "noah",
      "summary": "Trend model is validated and ready for playbook packaging.",
      "notes": "Trend model is validated and ready for playbook packaging.",
      "createdAt": "2026-05-05T12:00:00Z",
      "status": "reviewed",
      "reportType": "qa",
      "result": "pass",
      "reviewedById": "riley",
      "reviewedAt": "2026-05-05T12:00:00Z"
    }
  ],
  "teamReports": [],
  "qaRequests": [],
  "testResults": [
    {
      "id": "test-drive-practice-apr-25",
      "projectId": "project-robot-2026",
      "targetRefs": [
        {
          "kind": "milestone",
          "id": "drive-practice-apr-25"
        }
      ],
      "title": "Drive Practice Validation",
      "status": "blocked"
    },
    {
      "id": "test-robot-readiness-may-02",
      "projectId": "project-robot-2026",
      "targetRefs": [
        {
          "kind": "milestone",
          "id": "robot-readiness-may-02"
        }
      ],
      "title": "Robot Readiness Validation",
      "status": "blocked"
    },
    {
      "id": "test-week-zero-may-09",
      "projectId": "project-robot-2026",
      "targetRefs": [
        {
          "kind": "milestone",
          "id": "week-zero-may-09"
        }
      ],
      "title": "Week Zero Operations and Scouting Validation",
      "status": "blocked"
    },
    {
      "id": "test-stem-night-may-05",
      "projectId": "project-outreach-2026",
      "targetRefs": [
        {
          "kind": "milestone",
          "id": "stem-night-may-05"
        }
      ],
      "title": "STEM Night Dry Run",
      "status": "pass"
    }
  ],
  "qaFindings": [
    {
      "id": "qafinding-intake-guard-cut-quality",
      "targetRefs": [
        {
          "kind": "task",
          "id": "intake-guard"
        },
        {
          "kind": "workstream",
          "id": "workstream-manipulator"
        },
        {
          "kind": "subsystem",
          "id": "manipulator"
        },
        {
          "kind": "mechanism",
          "id": "intake-roller"
        },
        {
          "kind": "part-instance",
          "id": "pi-intake-guard-set"
        }
      ],
      "projectId": "project-robot-2026",
      "title": "Intake guard cut quality below tolerance",
      "detail": "Latest CNC pass still has edge chatter at mounting slots and should be recut before closeout.",
      "severity": "high",
      "status": "open",
      "createdAt": "2026-04-21T17:30:00-04:00",
      "updatedAt": "2026-04-21T17:30:00-04:00",
      "reportId": "qareport-intake-guard"
    },
    {
      "id": "qafinding-outreach-signage-density",
      "targetRefs": [
        {
          "kind": "task",
          "id": "outreach-kiosk-assembly"
        },
        {
          "kind": "workstream",
          "id": "workstream-outreach-milestones"
        },
        {
          "kind": "subsystem",
          "id": "outreach"
        },
        {
          "kind": "mechanism",
          "id": "demo-kiosk"
        },
        {
          "kind": "part-instance",
          "id": "pi-demo-kiosk-signage"
        },
        {
          "kind": "artifact",
          "id": "artifact-stem-night-run-of-show"
        }
      ],
      "projectId": "project-outreach-2026",
      "title": "Outreach kiosk signage copy is too dense",
      "detail": "Queue signage contains too much text and slows attendee onboarding at the kiosk entry.",
      "severity": "medium",
      "status": "in-progress",
      "createdAt": "2026-05-01T10:20:00-04:00",
      "updatedAt": "2026-05-02T09:00:00-04:00",
      "reportId": "qareport-kiosk-assembly"
    },
    {
      "id": "qafinding-swerve-bracket",
      "targetRefs": [
        {
          "kind": "task",
          "id": "swerve-sensor-bundle"
        },
        {
          "kind": "part-instance",
          "id": "pi-swerve-encoder-bracket-front-left"
        }
      ],
      "reportId": "qareport-swerve-sensor-bundle",
      "projectId": "project-robot-2026",
      "title": "Review bracket edge quality",
      "detail": "Inspect the printed bracket edge before final assembly.",
      "severity": "medium",
      "status": "open",
      "createdAt": "2026-04-21T17:30:00-04:00",
      "updatedAt": "2026-04-21T17:30:00-04:00"
    }
  ],
  "testFindings": [
    {
      "id": "testfinding-vision-corner-confidence",
      "targetRefs": [
        {
          "kind": "task",
          "id": "vision-calibration-sweep"
        },
        {
          "kind": "workstream",
          "id": "workstream-controls"
        },
        {
          "kind": "subsystem",
          "id": "vision"
        },
        {
          "kind": "mechanism",
          "id": "limelight-mount"
        },
        {
          "kind": "part-instance",
          "id": "pi-limelight-mount"
        }
      ],
      "projectId": "project-robot-2026",
      "title": "Vision confidence drop near field corners",
      "detail": "Localization confidence dips during high-speed corner turns and needs additional tuning evidence.",
      "severity": "medium",
      "status": "open",
      "createdAt": "2026-05-02T12:05:00-04:00",
      "updatedAt": "2026-05-02T12:05:00-04:00",
      "reportId": null,
      "testResultId": "test-robot-readiness-may-02"
    },
    {
      "id": "testfinding-scouting-wifi-retries",
      "targetRefs": [
        {
          "kind": "task",
          "id": "scouting-tablet-refresh"
        },
        {
          "kind": "workstream",
          "id": "workstream-scouting-data"
        },
        {
          "kind": "subsystem",
          "id": "scouting"
        },
        {
          "kind": "mechanism",
          "id": "tablet-sync"
        },
        {
          "kind": "part-instance",
          "id": "pi-tablet-mount-brackets"
        },
        {
          "kind": "artifact",
          "id": "artifact-scouting-ingest-notes"
        }
      ],
      "projectId": "project-training-2026",
      "title": "Tablet sync retry rate above target",
      "detail": "Crowded network simulation still exceeds retry budget and requires additional reconnect hardening.",
      "severity": "high",
      "status": "in-progress",
      "createdAt": "2026-05-09T18:45:00-04:00",
      "updatedAt": "2026-05-10T09:10:00-04:00",
      "reportId": null,
      "testResultId": "test-week-zero-may-09"
    }
  ],
  "designIterations": [
    {
      "id": "iteration-intake-guard-recut",
      "sourceType": "qa",
      "findingId": "qafinding-intake-guard-cut-quality",
      "projectId": "project-robot-2026",
      "targetRefs": [
        {
          "kind": "task",
          "id": "intake-guard"
        },
        {
          "kind": "subsystem",
          "id": "manipulator"
        },
        {
          "kind": "mechanism",
          "id": "intake-roller"
        },
        {
          "kind": "part-instance",
          "id": "pi-intake-guard-set"
        }
      ],
      "notes": "Adjust cutter feed and rerun Batch B-17 guard plate profile pass.",
      "status": "in-progress",
      "createdAt": "2026-04-22T08:00:00-04:00",
      "updatedAt": "2026-04-23T15:20:00-04:00"
    },
    {
      "id": "iteration-kiosk-signage-rewrite",
      "sourceType": "qa",
      "findingId": "qafinding-outreach-signage-density",
      "projectId": "project-outreach-2026",
      "targetRefs": [
        {
          "kind": "task",
          "id": "outreach-script-rehearsal"
        },
        {
          "kind": "subsystem",
          "id": "outreach"
        },
        {
          "kind": "mechanism",
          "id": "demo-kiosk"
        },
        {
          "kind": "part-instance",
          "id": "pi-demo-kiosk-signage"
        }
      ],
      "notes": "Simplify entrance signage and align copy with run-of-show callouts.",
      "status": "planned",
      "createdAt": "2026-05-02T09:30:00-04:00",
      "updatedAt": "2026-05-02T09:30:00-04:00"
    },
    {
      "id": "iteration-scouting-reconnect-hardening",
      "sourceType": "test",
      "findingId": "testfinding-scouting-wifi-retries",
      "projectId": "project-training-2026",
      "targetRefs": [
        {
          "kind": "task",
          "id": "scouting-tablet-refresh"
        },
        {
          "kind": "subsystem",
          "id": "scouting"
        },
        {
          "kind": "mechanism",
          "id": "tablet-sync"
        },
        {
          "kind": "part-instance",
          "id": "pi-tablet-mount-brackets"
        }
      ],
      "notes": "Document and implement reconnect fallback behavior for congested venue Wi-Fi.",
      "status": "in-progress",
      "createdAt": "2026-05-10T10:00:00-04:00",
      "updatedAt": "2026-05-10T10:00:00-04:00"
    },
    {
      "id": "iteration-swerve-bracket-recheck",
      "sourceType": "qa",
      "findingId": "qafinding-swerve-bracket",
      "projectId": "project-robot-2026",
      "targetRefs": [
        {
          "kind": "subsystem",
          "id": "drive"
        },
        {
          "kind": "mechanism",
          "id": "swerve-module"
        },
        {
          "kind": "part-instance",
          "id": "pi-swerve-encoder-bracket-front-left"
        },
        {
          "kind": "task",
          "id": "swerve-sensor-bundle"
        }
      ],
      "notes": "Recheck the printed bracket edge before final assembly.",
      "status": "planned",
      "createdAt": "2026-04-23T17:30:00-04:00",
      "updatedAt": "2026-04-23T17:30:00-04:00"
    }
  ],
  "risks": [
    {
      "id": "risk-cnc-throughput",
      "projectId": "project-robot-2026",
      "title": "Manipulator progress is gated by CNC throughput",
      "detail": "Batch B-17 must clear before the intake guard task can return to QA.",
      "severity": "high",
      "category": "other",
      "status": "open",
      "blocksWork": true,
      "source": {
        "kind": "report",
        "id": "qareport-intake-guard"
      },
      "relatedTargets": [
        {
          "kind": "workstream",
          "id": "workstream-manipulator"
        }
      ],
      "mitigationTaskId": "intake-guard",
      "ownerGroupId": null,
      "ownerMemberId": null,
      "mitigationDueDate": null,
      "createdAt": "2026-04-22T12:00:00Z",
      "updatedAt": "2026-04-22T12:00:00Z",
      "resolvedAt": null
    },
    {
      "id": "risk-drive-evidence-delay",
      "projectId": "project-robot-2026",
      "title": "Controls review is blocked by missing drive evidence",
      "detail": "Auto safety validation depends on final drive calibration documentation.",
      "severity": "medium",
      "category": "other",
      "status": "open",
      "blocksWork": true,
      "source": {
        "kind": "test-result",
        "id": "test-drive-practice-apr-25"
      },
      "relatedTargets": [
        {
          "kind": "workstream",
          "id": "workstream-controls"
        }
      ],
      "mitigationTaskId": "auto-safety-review",
      "ownerGroupId": null,
      "ownerMemberId": null,
      "mitigationDueDate": null,
      "createdAt": "2026-04-22T12:00:00Z",
      "updatedAt": "2026-04-22T12:00:00Z",
      "resolvedAt": null
    },
    {
      "id": "risk-vision-confidence",
      "projectId": "project-robot-2026",
      "title": "Vision confidence drops at high-speed cornering",
      "detail": "Localization jitter remains visible during high-speed turns near field edges.",
      "severity": "medium",
      "category": "other",
      "status": "open",
      "blocksWork": true,
      "source": {
        "kind": "report",
        "id": "qareport-vision-calibration"
      },
      "relatedTargets": [
        {
          "kind": "mechanism",
          "id": "limelight-mount"
        }
      ],
      "mitigationTaskId": "vision-calibration-sweep",
      "ownerGroupId": null,
      "ownerMemberId": null,
      "mitigationDueDate": null,
      "createdAt": "2026-04-22T12:00:00Z",
      "updatedAt": "2026-04-22T12:00:00Z",
      "resolvedAt": null
    },
    {
      "id": "risk-climb-hardware-delay",
      "projectId": "project-robot-2026",
      "title": "Climber validation is gated by delayed ratchet hardware",
      "detail": "Load test completion cannot proceed until final ratchet service kit arrives.",
      "severity": "high",
      "category": "other",
      "status": "open",
      "blocksWork": true,
      "source": {
        "kind": "test-result",
        "id": "test-robot-readiness-may-02"
      },
      "relatedTargets": [
        {
          "kind": "workstream",
          "id": "workstream-manipulator"
        }
      ],
      "mitigationTaskId": "climb-load-test",
      "ownerGroupId": null,
      "ownerMemberId": null,
      "mitigationDueDate": null,
      "createdAt": "2026-04-22T12:00:00Z",
      "updatedAt": "2026-04-22T12:00:00Z",
      "resolvedAt": null
    },
    {
      "id": "risk-scouting-network-load",
      "projectId": "project-training-2026",
      "title": "Scouting ingest degrades on crowded venue networks",
      "detail": "Observed retry behavior increases sync latency during high traffic windows.",
      "severity": "high",
      "category": "other",
      "status": "open",
      "blocksWork": true,
      "source": {
        "kind": "test-result",
        "id": "test-week-zero-may-09"
      },
      "relatedTargets": [
        {
          "kind": "workstream",
          "id": "workstream-scouting-data"
        }
      ],
      "mitigationTaskId": "scouting-tablet-refresh",
      "ownerGroupId": null,
      "ownerMemberId": null,
      "mitigationDueDate": null,
      "createdAt": "2026-04-22T12:00:00Z",
      "updatedAt": "2026-04-22T12:00:00Z",
      "resolvedAt": null
    },
    {
      "id": "risk-outreach-signage-clarity",
      "projectId": "project-outreach-2026",
      "title": "Outreach kiosk signage needs iteration",
      "detail": "Queueing and presenter guidance signs are still too dense for first-time visitors.",
      "severity": "low",
      "category": "other",
      "status": "open",
      "blocksWork": true,
      "source": {
        "kind": "report",
        "id": "qareport-kiosk-assembly"
      },
      "relatedTargets": [
        {
          "kind": "project",
          "id": "project-outreach-2026"
        }
      ],
      "mitigationTaskId": "outreach-script-rehearsal",
      "ownerGroupId": null,
      "ownerMemberId": null,
      "mitigationDueDate": null,
      "createdAt": "2026-04-22T12:00:00Z",
      "updatedAt": "2026-04-22T12:00:00Z",
      "resolvedAt": null
    }
  ],
  "workLogs": [
    {
      "id": "log-1",
      "taskId": "swerve-sensor-bundle",
      "date": "2026-04-20",
      "hours": 3,
      "participantIds": [
        "ava",
        "marco"
      ],
      "notes": "Harness cleanup and re-zero check.",
      "createdById": "ava"
    },
    {
      "id": "log-2",
      "taskId": "intake-guard",
      "date": "2026-04-20",
      "hours": 2.5,
      "participantIds": [
        "lucas"
      ],
      "notes": "Updated slot dimensions and fixture notes.",
      "createdById": "lucas"
    },
    {
      "id": "log-3",
      "taskId": "pdh-labels",
      "date": "2026-04-19",
      "hours": 1.5,
      "participantIds": [
        "priya"
      ],
      "notes": "Printed labels and matched drivetrain breakers to diagram.",
      "createdById": "priya"
    },
    {
      "id": "log-4",
      "taskId": "pit-checklist",
      "date": "2026-04-20",
      "hours": 1,
      "participantIds": [
        "priya",
        "maya"
      ],
      "notes": "Checked drivetrain harness routing and inspection gaps.",
      "createdById": "priya"
    },
    {
      "id": "log-5",
      "taskId": "vision-calibration-sweep",
      "date": "2026-04-29",
      "hours": 2,
      "participantIds": [
        "ethan",
        "noah"
      ],
      "notes": "Captured offset deltas and validated confidence overlay behavior.",
      "createdById": "ethan"
    },
    {
      "id": "log-6",
      "taskId": "pit-board-refresh",
      "date": "2026-04-27",
      "hours": 1.5,
      "participantIds": [
        "sofia",
        "marco"
      ],
      "notes": "Reworked queue lanes and handoff status labels for quick pit triage.",
      "createdById": "sofia"
    },
    {
      "id": "log-7",
      "taskId": "scouting-tablet-refresh",
      "date": "2026-04-30",
      "hours": 2.5,
      "participantIds": [
        "noah",
        "olivia"
      ],
      "notes": "Re-imaged five tablets and verified staged sync retry behavior.",
      "createdById": "noah"
    },
    {
      "id": "log-8",
      "taskId": "outreach-kiosk-assembly",
      "date": "2026-05-01",
      "hours": 2,
      "participantIds": [
        "zoe",
        "maya"
      ],
      "notes": "Mounted signage and finalized kiosk cable routing for safe foot traffic.",
      "createdById": "zoe"
    },
    {
      "id": "log-9",
      "taskId": "travel-pack-finalize",
      "date": "2026-05-02",
      "hours": 1.5,
      "participantIds": [
        "maya",
        "lena"
      ],
      "notes": "Updated emergency contacts, tool manifest, and loading sequence notes.",
      "createdById": "maya"
    },
    {
      "id": "log-10",
      "taskId": "climb-load-test",
      "date": "2026-05-02",
      "hours": 1,
      "participantIds": [
        "ben",
        "jordan"
      ],
      "notes": "Completed first static hold run and measured ratchet slip tolerance.",
      "createdById": "ben"
    },
    {
      "id": "log-11",
      "taskId": "scouting-rubric-training",
      "date": "2026-05-03",
      "hours": 1.25,
      "participantIds": [
        "sofia",
        "noah"
      ],
      "notes": "Ran sample-match scoring and resolved two rubric interpretation mismatches.",
      "createdById": "sofia"
    },
    {
      "id": "log-12",
      "taskId": "wire-swerve-module",
      "date": "2026-04-23",
      "hours": 1.25,
      "participantIds": [
        "ava"
      ],
      "notes": "Terminated steer motor leads and labeled the harness branch points.",
      "createdById": "ava"
    },
    {
      "id": "log-13",
      "taskId": "wire-intake-roller",
      "date": "2026-04-24",
      "hours": 1.5,
      "participantIds": [
        "lucas"
      ],
      "notes": "Routed roller motor leads and added strain relief near intake pivot.",
      "createdById": "lucas"
    },
    {
      "id": "log-14",
      "taskId": "integrate-manipulator",
      "date": "2026-04-24",
      "hours": 1,
      "participantIds": [
        "ava",
        "lucas"
      ],
      "notes": "Checked manipulator-to-drive fit and logged interface clearance notes.",
      "createdById": "ava"
    },
    {
      "id": "log-15",
      "taskId": "auto-safety-review",
      "date": "2026-04-28",
      "hours": 1.25,
      "participantIds": [
        "ethan",
        "riley"
      ],
      "notes": "Reviewed safety abort paths and documented edge-case driver overrides.",
      "createdById": "ethan"
    },
    {
      "id": "log-16",
      "taskId": "wire-auto-safety",
      "date": "2026-04-29",
      "hours": 1,
      "participantIds": [
        "ethan"
      ],
      "notes": "Completed harness layout draft and staged connectors for final install.",
      "createdById": "ethan"
    },
    {
      "id": "log-17",
      "taskId": "integrate-controls",
      "date": "2026-04-30",
      "hours": 1.5,
      "participantIds": [
        "ava",
        "ethan"
      ],
      "notes": "Validated control handoffs and updated integration checklist statuses.",
      "createdById": "ava"
    },
    {
      "id": "log-18",
      "taskId": "wire-limelight-mount",
      "date": "2026-04-30",
      "hours": 1.25,
      "participantIds": [
        "ethan"
      ],
      "notes": "Crimped camera power run and added loop slack for service access.",
      "createdById": "ethan"
    },
    {
      "id": "log-19",
      "taskId": "integrate-vision",
      "date": "2026-05-03",
      "hours": 1,
      "participantIds": [
        "ava",
        "ethan"
      ],
      "notes": "Ran initial vision-drive integration pass and recorded acceptance criteria.",
      "createdById": "ava"
    },
    {
      "id": "log-20",
      "taskId": "pit-bin-labeling",
      "date": "2026-04-27",
      "hours": 1,
      "participantIds": [
        "olivia"
      ],
      "notes": "Applied revised bin codes and linked labels to the pit board legend.",
      "createdById": "olivia"
    },
    {
      "id": "log-21",
      "taskId": "outreach-script-rehearsal",
      "date": "2026-05-02",
      "hours": 1.25,
      "participantIds": [
        "zoe",
        "maya"
      ],
      "notes": "Timed full script run and tuned pacing for volunteer presenter transitions.",
      "createdById": "zoe"
    },
    {
      "id": "log-22",
      "taskId": "media-highlight-cut",
      "date": "2026-05-04",
      "hours": 2.25,
      "participantIds": [
        "zoe",
        "marco"
      ],
      "notes": "Assembled first highlight sequence and marked sections needing sponsor-safe trims.",
      "createdById": "zoe"
    },
    {
      "id": "log-23",
      "taskId": "media-social-rollout",
      "date": "2026-05-05",
      "hours": 1,
      "participantIds": [
        "zoe"
      ],
      "notes": "Drafted rollout checklist and queued platform-specific caption variants.",
      "createdById": "zoe"
    },
    {
      "id": "log-24",
      "taskId": "strategy-opponent-model-update",
      "date": "2026-05-04",
      "hours": 2,
      "participantIds": [
        "noah",
        "riley"
      ],
      "notes": "Updated matchup weights using scrimmage cycle-time deltas and foul risk notes.",
      "createdById": "noah"
    },
    {
      "id": "log-25",
      "taskId": "strategy-playoff-scenario-cards",
      "date": "2026-05-05",
      "hours": 1.5,
      "participantIds": [
        "noah"
      ],
      "notes": "Built first pass of scenario cards covering balanced and defense-first pairings.",
      "createdById": "noah"
    },
    {
      "id": "log-26",
      "taskId": "strategy-drive-team-brief",
      "date": "2026-05-06",
      "hours": 0.75,
      "participantIds": [
        "noah",
        "ava"
      ],
      "notes": "Collected driver feedback on preferred card layout before final brief rehearsal.",
      "createdById": "noah"
    }
  ],
  "meetings": [
    {
      "id": "design-review",
      "title": "Subsystem design review",
      "meetingType": "review",
      "seasonId": "default-season",
      "projectIds": [
        "project-robot-2026"
      ],
      "startAt": "2026-04-23T18:30:00Z",
      "endAt": null,
      "location": "Workshop",
      "description": "Tutorial team meeting.",
      "rsvpsYes": 17,
      "rsvpsMaybe": 4,
      "openSignIns": 3
    },
    {
      "id": "pit-ops-standup",
      "title": "Pit operations standup",
      "meetingType": "review",
      "seasonId": "default-season",
      "projectIds": [
        "project-robot-2026"
      ],
      "startAt": "2026-04-26T17:45:00Z",
      "endAt": null,
      "location": "Workshop",
      "description": "Tutorial team meeting.",
      "rsvpsYes": 12,
      "rsvpsMaybe": 3,
      "openSignIns": 2
    },
    {
      "id": "stem-night-planning",
      "title": "STEM night planning",
      "meetingType": "review",
      "seasonId": "default-season",
      "projectIds": [
        "project-robot-2026"
      ],
      "startAt": "2026-04-29T19:00:00Z",
      "endAt": null,
      "location": "Workshop",
      "description": "Tutorial team meeting.",
      "rsvpsYes": 10,
      "rsvpsMaybe": 5,
      "openSignIns": 4
    },
    {
      "id": "scouting-training-kickoff",
      "title": "Scouting training kickoff",
      "meetingType": "review",
      "seasonId": "default-season",
      "projectIds": [
        "project-robot-2026"
      ],
      "startAt": "2026-05-01T18:15:00Z",
      "endAt": null,
      "location": "Workshop",
      "description": "Tutorial team meeting.",
      "rsvpsYes": 14,
      "rsvpsMaybe": 2,
      "openSignIns": 3
    }
  ],
  "events": [],
  "attendanceRecords": [
    {
      "id": "att-1",
      "memberId": "ava",
      "date": "2026-04-20",
      "totalHours": 3.5
    },
    {
      "id": "att-2",
      "memberId": "lucas",
      "date": "2026-04-20",
      "totalHours": 2.5
    },
    {
      "id": "att-3",
      "memberId": "priya",
      "date": "2026-04-20",
      "totalHours": 3
    },
    {
      "id": "att-4",
      "memberId": "ethan",
      "date": "2026-04-20",
      "totalHours": 2
    },
    {
      "id": "att-5",
      "memberId": "jordan",
      "date": "2026-04-20",
      "totalHours": 2.5
    },
    {
      "id": "att-6",
      "memberId": "noah",
      "date": "2026-04-20",
      "totalHours": 3
    },
    {
      "id": "att-7",
      "memberId": "zoe",
      "date": "2026-04-20",
      "totalHours": 2.75
    },
    {
      "id": "att-8",
      "memberId": "ben",
      "date": "2026-04-20",
      "totalHours": 2.25
    },
    {
      "id": "att-9",
      "memberId": "sofia",
      "date": "2026-04-20",
      "totalHours": 4
    },
    {
      "id": "att-10",
      "memberId": "marco",
      "date": "2026-04-20",
      "totalHours": 2.5
    },
    {
      "id": "att-11",
      "memberId": "lena",
      "date": "2026-04-20",
      "totalHours": 1.5
    },
    {
      "id": "att-12",
      "memberId": "olivia",
      "date": "2026-04-20",
      "totalHours": 2
    }
  ],
  "manufacturingProcesses": [
    {
      "id": "cnc",
      "code": "cnc",
      "name": "CNC",
      "isActive": true
    },
    {
      "id": "3d-print",
      "code": "3d-print",
      "name": "3D Print",
      "isActive": true
    },
    {
      "id": "fabrication",
      "code": "fabrication",
      "name": "Fabrication",
      "isActive": true
    }
  ],
  "purchaseItems": [
    {
      "id": "polycarb-sheet",
      "taskId": "intake-guard",
      "kind": "cots-goods",
      "partDefinitionId": "pd-polycarbonate-sheet",
      "materialId": null,
      "title": "Polycarbonate Sheet",
      "quantity": 2,
      "quotes": [
        {
          "id": "quote-polycarb-sheet",
          "vendorId": "vendor-demo-9",
          "reference": "mcmaster.com/8560K239",
          "amount": {
            "amount": 82,
            "currency": "USD"
          },
          "quotedAt": "2026-04-20T12:00:00Z"
        }
      ],
      "selectedQuoteId": "quote-polycarb-sheet",
      "approvalStatus": "approved",
      "approvedById": "lucas",
      "approvedAt": "2026-04-21T12:00:00Z",
      "purchaseOrderNumber": "DEMO-001",
      "orderStatus": "ordered",
      "finalCost": {
        "amount": 82,
        "currency": "USD"
      },
      "expectedDeliveryDate": null,
      "trackingNumber": null,
      "trackingUrl": null,
      "orderedAt": "2026-04-22T12:00:00Z",
      "deliveredAt": null
    },
    {
      "id": "ferrule-kit",
      "taskId": "pit-checklist",
      "kind": "cots-goods",
      "partDefinitionId": "pd-ferrule-refill-kit",
      "materialId": null,
      "title": "Ferrule Refill Kit",
      "quantity": 1,
      "quotes": [
        {
          "id": "quote-ferrule-kit",
          "vendorId": "vendor-demo-4",
          "reference": "automationdirect.com/ferrules",
          "amount": {
            "amount": 39,
            "currency": "USD"
          },
          "quotedAt": "2026-04-20T12:00:00Z"
        }
      ],
      "selectedQuoteId": "quote-ferrule-kit",
      "approvalStatus": "pending",
      "approvedById": null,
      "approvedAt": null,
      "purchaseOrderNumber": null,
      "orderStatus": "not-ordered",
      "finalCost": null,
      "expectedDeliveryDate": null,
      "trackingNumber": null,
      "trackingUrl": null,
      "orderedAt": null,
      "deliveredAt": null
    },
    {
      "id": "sprocket-pack",
      "taskId": "pit-checklist",
      "kind": "cots-goods",
      "partDefinitionId": "pd-sprocket-service-pack",
      "materialId": null,
      "title": "Sprocket Service Pack",
      "quantity": 1,
      "quotes": [
        {
          "id": "quote-sprocket-pack",
          "vendorId": "vendor-demo-10",
          "reference": "revrobotics.com",
          "amount": {
            "amount": 64,
            "currency": "USD"
          },
          "quotedAt": "2026-04-20T12:00:00Z"
        }
      ],
      "selectedQuoteId": "quote-sprocket-pack",
      "approvalStatus": "approved",
      "approvedById": "ava",
      "approvedAt": "2026-04-21T12:00:00Z",
      "purchaseOrderNumber": "DEMO-003",
      "orderStatus": "delivered",
      "finalCost": {
        "amount": 64,
        "currency": "USD"
      },
      "expectedDeliveryDate": null,
      "trackingNumber": null,
      "trackingUrl": null,
      "orderedAt": "2026-04-22T12:00:00Z",
      "deliveredAt": "2026-04-25T12:00:00Z"
    },
    {
      "id": "cat6-bulk-pack",
      "taskId": "vision-calibration-sweep",
      "kind": "cots-goods",
      "partDefinitionId": null,
      "materialId": null,
      "title": "CAT6 Bulk Pack",
      "quantity": 1,
      "quotes": [
        {
          "id": "quote-cat6-bulk-pack",
          "vendorId": "vendor-demo-8",
          "reference": "monoprice.com/networking",
          "amount": {
            "amount": 54,
            "currency": "USD"
          },
          "quotedAt": "2026-04-20T12:00:00Z"
        }
      ],
      "selectedQuoteId": "quote-cat6-bulk-pack",
      "approvalStatus": "pending",
      "approvedById": null,
      "approvedAt": null,
      "purchaseOrderNumber": null,
      "orderStatus": "not-ordered",
      "finalCost": null,
      "expectedDeliveryDate": null,
      "trackingNumber": null,
      "trackingUrl": null,
      "orderedAt": null,
      "deliveredAt": null
    },
    {
      "id": "climber-ratchet-kit",
      "taskId": "climb-load-test",
      "kind": "cots-goods",
      "partDefinitionId": null,
      "materialId": null,
      "title": "Climber Ratchet Service Kit",
      "quantity": 1,
      "quotes": [
        {
          "id": "quote-climber-ratchet-kit",
          "vendorId": "vendor-demo-11",
          "reference": "wcproducts.com/ratchet-kit",
          "amount": {
            "amount": 68,
            "currency": "USD"
          },
          "quotedAt": "2026-04-20T12:00:00Z"
        }
      ],
      "selectedQuoteId": "quote-climber-ratchet-kit",
      "approvalStatus": "pending",
      "approvedById": null,
      "approvedAt": null,
      "purchaseOrderNumber": null,
      "orderStatus": "not-ordered",
      "finalCost": null,
      "expectedDeliveryDate": null,
      "trackingNumber": null,
      "trackingUrl": null,
      "orderedAt": null,
      "deliveredAt": null
    },
    {
      "id": "anderson-service-pack",
      "taskId": "pit-board-refresh",
      "kind": "cots-goods",
      "partDefinitionId": "pd-anderson-service-pack",
      "materialId": null,
      "title": "Anderson Service Pack",
      "quantity": 2,
      "quotes": [
        {
          "id": "quote-anderson-service-pack",
          "vendorId": "vendor-demo-6",
          "reference": "andymark.com/electrical",
          "amount": {
            "amount": 72,
            "currency": "USD"
          },
          "quotedAt": "2026-04-20T12:00:00Z"
        }
      ],
      "selectedQuoteId": "quote-anderson-service-pack",
      "approvalStatus": "approved",
      "approvedById": "sofia",
      "approvedAt": "2026-04-21T12:00:00Z",
      "purchaseOrderNumber": null,
      "orderStatus": "not-ordered",
      "finalCost": null,
      "expectedDeliveryDate": null,
      "trackingNumber": null,
      "trackingUrl": null,
      "orderedAt": null,
      "deliveredAt": null
    },
    {
      "id": "demo-kiosk-signage-print-order",
      "taskId": "outreach-kiosk-assembly",
      "kind": "cots-goods",
      "partDefinitionId": "pd-demo-kiosk-signage",
      "materialId": null,
      "title": "Kiosk Signage Print Order",
      "quantity": 1,
      "quotes": [
        {
          "id": "quote-demo-kiosk-signage-print-order",
          "vendorId": "vendor-demo-12",
          "reference": "printshop.local/order/1921",
          "amount": {
            "amount": 95,
            "currency": "USD"
          },
          "quotedAt": "2026-04-20T12:00:00Z"
        }
      ],
      "selectedQuoteId": "quote-demo-kiosk-signage-print-order",
      "approvalStatus": "approved",
      "approvedById": "zoe",
      "approvedAt": "2026-04-21T12:00:00Z",
      "purchaseOrderNumber": "DEMO-007",
      "orderStatus": "ordered",
      "finalCost": {
        "amount": 95,
        "currency": "USD"
      },
      "expectedDeliveryDate": null,
      "trackingNumber": null,
      "trackingUrl": null,
      "orderedAt": "2026-04-22T12:00:00Z",
      "deliveredAt": null
    },
    {
      "id": "travel-case-foam",
      "taskId": "pit-checklist",
      "kind": "cots-goods",
      "partDefinitionId": null,
      "materialId": null,
      "title": "Travel Case Foam Inserts",
      "quantity": 4,
      "quotes": [
        {
          "id": "quote-travel-case-foam",
          "vendorId": "vendor-demo-7",
          "reference": "uline.com/case-foam",
          "amount": {
            "amount": 110,
            "currency": "USD"
          },
          "quotedAt": "2026-04-20T12:00:00Z"
        }
      ],
      "selectedQuoteId": "quote-travel-case-foam",
      "approvalStatus": "approved",
      "approvedById": "maya",
      "approvedAt": "2026-04-21T12:00:00Z",
      "purchaseOrderNumber": null,
      "orderStatus": "not-ordered",
      "finalCost": null,
      "expectedDeliveryDate": null,
      "trackingNumber": null,
      "trackingUrl": null,
      "orderedAt": null,
      "deliveredAt": null
    },
    {
      "id": "tablet-charger-hub",
      "taskId": "pit-checklist",
      "kind": "cots-goods",
      "partDefinitionId": null,
      "materialId": null,
      "title": "Tablet Charging Hub",
      "quantity": 2,
      "quotes": [
        {
          "id": "quote-tablet-charger-hub",
          "vendorId": "vendor-demo-13",
          "reference": "anker.com/charging-hub",
          "amount": {
            "amount": 78,
            "currency": "USD"
          },
          "quotedAt": "2026-04-20T12:00:00Z"
        }
      ],
      "selectedQuoteId": "quote-tablet-charger-hub",
      "approvalStatus": "approved",
      "approvedById": "noah",
      "approvedAt": "2026-04-21T12:00:00Z",
      "purchaseOrderNumber": "DEMO-009",
      "orderStatus": "delivered",
      "finalCost": {
        "amount": 78,
        "currency": "USD"
      },
      "expectedDeliveryDate": null,
      "trackingNumber": null,
      "trackingUrl": null,
      "orderedAt": "2026-04-22T12:00:00Z",
      "deliveredAt": "2026-04-25T12:00:00Z"
    },
    {
      "id": "media-uplink-batteries",
      "taskId": "media-highlight-cut",
      "kind": "cots-goods",
      "partDefinitionId": null,
      "materialId": null,
      "title": "Camera Uplink Battery Pack",
      "quantity": 2,
      "quotes": [
        {
          "id": "quote-media-uplink-batteries",
          "vendorId": "vendor-demo-14",
          "reference": "bhphotovideo.com/battery-pack",
          "amount": {
            "amount": 146,
            "currency": "USD"
          },
          "quotedAt": "2026-04-20T12:00:00Z"
        }
      ],
      "selectedQuoteId": "quote-media-uplink-batteries",
      "approvalStatus": "approved",
      "approvedById": "zoe",
      "approvedAt": "2026-04-21T12:00:00Z",
      "purchaseOrderNumber": "DEMO-010",
      "orderStatus": "ordered",
      "finalCost": {
        "amount": 146,
        "currency": "USD"
      },
      "expectedDeliveryDate": null,
      "trackingNumber": null,
      "trackingUrl": null,
      "orderedAt": "2026-04-22T12:00:00Z",
      "deliveredAt": null
    },
    {
      "id": "outsourced-swerve-bracket",
      "taskId": "swerve-sensor-bundle",
      "kind": "manufacturing-service",
      "partDefinitionId": "pd-swerve-encoder-bracket",
      "materialId": "mat-onyx-filament",
      "title": "Outsourced swerve sensor bracket fabrication",
      "quantity": 1,
      "quotes": [],
      "selectedQuoteId": null,
      "approvalStatus": "pending",
      "approvedById": null,
      "approvedAt": null,
      "purchaseOrderNumber": null,
      "orderStatus": "not-ordered",
      "finalCost": null,
      "expectedDeliveryDate": null,
      "trackingNumber": null,
      "trackingUrl": null,
      "orderedAt": null,
      "deliveredAt": null
    }
  ],
  "escalations": [],
  "actions": []
};

const demoPlannedWeeklyHours: Record<string, number> = {
  ava: 6,
  lucas: 4,
  priya: 8,
  ethan: 3,
  jordan: 6,
  riley: 4,
  maya: 2,
  noah: 5,
  zoe: 2,
  ben: 7,
  sofia: 8,
  marco: 6,
  lena: 0,
  olivia: 3,
  "demo-alex-morgan": 8,
  "demo-sam-rivera": 6,
  "demo-taylor-chen": 4,
  "demo-jamie-patel": 10,
  "demo-casey-brooks": 6,
  "demo-quinn-parker": 5,
  "demo-riley-dawson": 4,
  "demo-jordan-ellis": 2,
};
snapshot.members = snapshot.members.map((member) => ({
  ...member,
  plannedWeeklyAttendanceHours: demoPlannedWeeklyHours[member.id] ?? 0,
}));

const teamDivisions = [
  { id: "team-mechanical", name: "Mechanical" },
  { id: "team-electrical", name: "Electrical" },
  { id: "team-programming", name: "Programming" },
  { id: "team-business", name: "Business" },
  { id: "team-strategy", name: "Strategy" },
  { id: "team-admin", name: "Admin" },
  { id: "team-media", name: "Media" },
] as const;
const demoStudents = snapshot.members.filter((member) => member.role === "student");
const demoMentors = snapshot.members.filter((member) => member.role === "mentor");
const seasonId = snapshot.seasons[0]?.id ?? "default-season";
snapshot.responsibleGroups = teamDivisions.map((division, index) => {
  const primaryStudents = demoStudents.filter((_, studentIndex) => studentIndex % teamDivisions.length === index);
  const secondaryStudents = demoStudents.filter((_, studentIndex) => studentIndex % teamDivisions.length === (index + teamDivisions.length - 1) % teamDivisions.length);
  const mentor = demoMentors[index % demoMentors.length]!;
  return {
    ...division,
    seasonId,
    projectIds: [],
    workTypeIds: [],
    memberIds: [...new Set([...primaryStudents, ...secondaryStudents].map((member) => member.id).concat(mentor.id))],
    primaryMemberIds: primaryStudents.map((member) => member.id),
    isArchived: false,
  };
});

const teamForTask = (task: (typeof snapshot.tasks)[number]) => {
  const workType = snapshot.workTypes.find((candidate) => candidate.id === task.workTypeId);
  const text = `${workType?.name ?? ""} ${task.title}`.toLocaleLowerCase();
  if (task.projectId === "project-media-2026" || /media|photo|video|graphic|social|website/.test(text)) return "team-media";
  if (task.projectId === "project-strategy-2026" || /scout|strategy|game analysis|data analysis|risk review/.test(text)) return "team-strategy";
  if (task.projectId === "project-operations-2026" || /admin|finance|operation|inventory|safety/.test(text)) return "team-admin";
  if (task.projectId === "project-outreach-2026" || /business|outreach|sponsor|partnership|presentation|writing|communication/.test(text)) return "team-business";
  if (/electrical|wiring|sensor|power|circuit/.test(text)) return "team-electrical";
  if (/program|software|code|drive|autonomous|controls/.test(text)) return "team-programming";
  return "team-mechanical";
};
for (const task of snapshot.tasks) task.responsibleGroupId = teamForTask(task);

const overdueDemoTask = snapshot.tasks.find((task) => task.id === "travel-pack-finalize");
if (overdueDemoTask) {
  overdueDemoTask.ownerId = "ben";
  overdueDemoTask.assigneeIds = ["ben"];
  overdueDemoTask.dueDate = "2026-04-20";
}

for (const [riskId, taskId] of [
  ["risk-cnc-throughput", "intake-guard"],
  ["risk-drive-evidence-delay", "auto-safety-review"],
] as const) {
  const risk = snapshot.risks.find((candidate) => candidate.id === riskId);
  if (risk && !risk.relatedTargets.some((target) => target.kind === "task" && target.id === taskId)) {
    risk.relatedTargets.push({ kind: "task", id: taskId });
  }
}
