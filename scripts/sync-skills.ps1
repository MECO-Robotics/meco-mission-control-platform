$ErrorActionPreference = "Stop"

$SkillsRepo = if ([string]::IsNullOrWhiteSpace($env:SKILLS_REPO)) {
    "https://github.com/MECO-Robotics/mission-control-skills.git"
} else {
    $env:SKILLS_REPO
}

$SkillsRef = if ([string]::IsNullOrWhiteSpace($env:SKILLS_REF)) {
    ""
} else {
    $env:SKILLS_REF
}

$TmpDir = ".tmp-skills-sync"

function Fail {
    param([string] $Message)

    Write-Error -Message "Error: $Message" -ErrorAction Continue
    exit 1
}

function Remove-Tmp {
    if (Test-Path -LiteralPath $TmpDir) {
        Remove-Item -LiteralPath $TmpDir -Recurse -Force
    }
}

try {
    $RepoRoot = (& git rev-parse --show-toplevel 2>$null)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($RepoRoot)) {
        Fail "not a git repository. Run this script from the app repo root."
    }

    $RootPath = (Resolve-Path -LiteralPath $RepoRoot).ProviderPath.TrimEnd("\")
    $CurrentPath = (Get-Location).ProviderPath.TrimEnd("\")

    if (-not [StringComparer]::OrdinalIgnoreCase.Equals($CurrentPath, $RootPath)) {
        Fail "run this script from the repository root: $RootPath"
    }

    Write-Host "Syncing skills from: $SkillsRepo"
    if (-not [string]::IsNullOrWhiteSpace($SkillsRef)) {
        Write-Host "Using skills ref: $SkillsRef"
    }

    Remove-Tmp

    & git clone $SkillsRepo $TmpDir
    if ($LASTEXITCODE -ne 0) {
        Fail "failed to clone shared skills repo: $SkillsRepo"
    }

    if (-not [string]::IsNullOrWhiteSpace($SkillsRef)) {
        & git -C $TmpDir checkout --quiet $SkillsRef
        if ($LASTEXITCODE -ne 0) {
            Fail "failed to checkout SKILLS_REF '$SkillsRef' from shared skills repo."
        }
    }

    $SharedSkills = Join-Path $TmpDir "skills"
    if (-not (Test-Path -LiteralPath $SharedSkills -PathType Container)) {
        $RefLabel = if ([string]::IsNullOrWhiteSpace($SkillsRef)) { "default branch" } else { $SkillsRef }
        Fail "shared repo ref '$RefLabel' does not contain a skills/ directory."
    }

    if (Test-Path -LiteralPath "skills") {
        Remove-Item -LiteralPath "skills" -Recurse -Force
    }

    Copy-Item -LiteralPath $SharedSkills -Destination "skills" -Recurse

    Remove-Tmp

    Write-Host "Synced skills/ successfully."
} finally {
    Remove-Tmp
}
