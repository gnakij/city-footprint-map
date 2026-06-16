#!/bin/bash
echo "🧪 Running pre-push tests..."

if command -v pytest &>/dev/null && [ -f "pytest.ini" -o -d "tests" ]; then
    python -m pytest -q || { echo "❌ Tests failed!"; exit 1; }
elif [ -f "package.json" ]; then
    npm test || { echo "❌ Tests failed!"; exit 1; }
fi
echo "✅ Tests passed"
