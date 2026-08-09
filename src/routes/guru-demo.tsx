import { createFileRoute } from '@tanstack/react-router';
import GuruCommandCenterDemo from '@/demo/guru-command-center-demo';

export const Route = createFileRoute('/guru-demo')({
  component: GuruCommandCenterDemo,
});
