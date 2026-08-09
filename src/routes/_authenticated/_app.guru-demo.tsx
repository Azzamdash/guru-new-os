import { createFileRoute } from '@tanstack/react-router';
import GuruCommandCenterDemo from '@/demo/guru-command-center-demo';

export const Route = createFileRoute('/_authenticated/_app/guru-demo')({
  component: GuruCommandCenterDemo,
});
