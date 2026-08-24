Code is all in https://github.com/thissophie/mux-video-monitor

Pull request & merge - after merge a github action runs that first builds the backend lambda (and then deploys it) followed by building the frontend.

You can run the frontend locally:

1. You'll need a recent node + corepack installed, then `pnpm install`
2. You can get your cookie by clicking the pretix link to view streaming and then going to https://live.aws.nextdayvideo.com.au/api/devtoken 
3. Run the frontend in testing with `NDV_AUD_COOKIE=cookie-goes-here pnpm start`

Things you might need during the conference:
1. https://live.aws.nextdayvideo.com.au/admin.html should give you most things you'd need to change
2. Streams starting and stopping push automatically from mux using a webhook to one of the lambdas. 
3. Room name + visibility do not push to the viewers automatically. It probably wouldn't be hard to right this up.


Much less likely to come up, but just in case
1. The backend caches things in dynamodb. You can force this to refresh using https://live.aws.nextdayvideo.com.au/api/refresh
2. Everything is deployed in the NDV AWS account in us-east-1 (I know)
3. Before the admin interface existed I used to just manage things in Parameter Store - https://162559259314-6gfmeiej.us-east-1.console.aws.amazon.com/systems-manager/parameters/?region=us-east-1&tab=Table - the stream name/order/fake-override parameters are in tags on the parameters that start with `/multiview/mux/{mux-steam-id}`. Anytime you change things here you'll need to use the /api/refresh endpoint above or clients won't pick it up.
4. Do NOT modify `ATTEND_JWT_AUDIENCE`, `ATTEND_JWT_ISSUER` or `ATTEND_JWT_PRIVATE_KEY` without coordinating with Sophie or Jack (these values come from Pretix).

What things are used:
1. Github Actions pushes everything to AWS using CloudFormation (I regret this, but I didn't expect this to last 5 years :/)
2. CloudFormation is split across infra/backend-bucket (so the backend can be built as a zip files and put somewhere) and infra/main-stack.
3. The backend is lambdas + API Gateway. API Gateway & CloudFormation was, I'm pretty sure, created to punish me for something I did. Sorry about this.
4. The frontend is mostly vanilla typescript + html, built with parcel.
5. The frontend gets push updates using ably.

