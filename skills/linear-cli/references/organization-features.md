# Organization Features

Detailed command reference for Linear CLI organization features: initiatives, labels, projects, and bulk operations.

## Initiative Management

```bash
# List initiatives (default: active only)
x-linear initiative list
x-linear initiative list --all-statuses
x-linear initiative list --status planned

# View initiative details
x-linear initiative view <id-or-slug>

# Create initiative
x-linear initiative create --name "Q1 Goals" --status active
x-linear initiative create -i  # Interactive mode

# Archive/unarchive
x-linear initiative archive <id>
x-linear initiative unarchive <id>

# Link projects to initiatives
x-linear initiative add-project <initiative> <project>
x-linear initiative remove-project <initiative> <project>
```

## Label Management

```bash
# List labels (shows ID, name, color, team)
x-linear label list
x-linear label list --team DEV
x-linear label list --workspace  # Workspace-level only

# Create label
x-linear label create --name "Bug" --color "#EB5757"
x-linear label create --name "Feature" --team DEV

# Delete label (by ID or name)
x-linear label delete <id>
x-linear label delete "Bug" --team DEV
```

## Project Management

```bash
# List projects
x-linear project list

# View project
x-linear project view <id>

# Create project
x-linear project create --name "New Feature" --team DEV
x-linear project create --name "Q1 Work" --team DEV --initiative "Q1 Goals"
x-linear project create -i  # Interactive mode
```

## Bulk Operations

```bash
# Delete multiple issues
x-linear issue delete --bulk DEV-123 DEV-124 DEV-125

# Delete from file (one ID per line)
x-linear issue delete --bulk-file issues.txt

# Delete from stdin
echo -e "DEV-123\nDEV-124" | x-linear issue delete --bulk-stdin

# Archive multiple initiatives
x-linear initiative archive --bulk <id1> <id2>
```

## Adding Labels to Issues

```bash
# Add label to issue
x-linear issue update DEV-123 --label "Bug"

# Add multiple labels
x-linear issue update DEV-123 --label "Bug" --label "High Priority"
```
